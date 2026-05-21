import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runModelCommand } from '../src/commands/model.js';
import { ConfigStore } from '../src/config/store.js';

const roots: string[] = [];
const modelsBody = {
  data: [
    { id: 'alpha/a:free', name: 'Alpha', context_length: 8192, architecture: { output_modalities: ['text'] } },
    { id: 'beta/b:free', name: 'Beta', context_length: 128000, architecture: { output_modalities: ['text'] } },
  ],
};

function tempStore(): ConfigStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-model-command-'));
  roots.push(root);
  return new ConfigStore(root);
}

function okFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify(modelsBody), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

function output(isTTY = false) {
  let text = '';
  return {
    stream: { isTTY, write: (chunk: string) => { text += chunk; } },
    text: () => text,
  };
}

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  vi.restoreAllMocks();
});

describe('model command integration', () => {
  it('--json emits JSON only and no ANSI', async () => {
    const store = tempStore();
    const out = output(false);
    await runModelCommand({ json: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: out.stream });
    expect(() => JSON.parse(out.text())).not.toThrow();
    expect(out.text()).not.toContain('\u001b');
  });

  it('--all stores the recommendation display order', async () => {
    const store = tempStore();
    store.recordSuccess('beta/b:free', 20);
    store.recordSuccess('alpha/a:free', 200);
    await runModelCommand({ all: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(false).stream });
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free', 'alpha/a:free']);
  });

  it('filters fresh cached models to currently configured providers', async () => {
    const store = tempStore();
    store.writeModelCache({
      models: [
        { id: 'openrouter/c:free', name: 'Cached OpenRouter', provider: 'openrouter', source: 'openrouter' },
        { id: 'nvidia/cached', upstreamId: 'cached', name: 'Cached NVIDIA', provider: 'nvidia', source: 'nvidia' },
      ],
      fetchedAt: new Date().toISOString(),
    });
    const out = output(false);
    const fetchImpl = vi.fn(okFetch());
    await runModelCommand({ json: true, store, fetchImpl, env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: out.stream });
    const body = JSON.parse(out.text()) as any;
    expect(body.models.map((model: any) => model.id)).toEqual(['openrouter/c:free']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses a fresh cached model list without refetching providers', async () => {
    const store = tempStore();
    store.writeModelCache({ models: [{ id: 'cached/c:free', name: 'Cached', provider: 'cached' }], fetchedAt: new Date().toISOString() });
    const out = output(false);
    const fetchImpl = vi.fn(okFetch());
    await runModelCommand({ json: true, store, fetchImpl, env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: out.stream });
    const body = JSON.parse(out.text()) as any;
    expect(body.models.map((model: any) => model.id)).toEqual(['cached/c:free']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('--select validates and writes selected IDs without TUI', async () => {
    const store = tempStore();
    const runTui = vi.fn();
    await runModelCommand({ select: ['beta/b:free'], store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(false).stream, runTui });
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
    expect(runTui).not.toHaveBeenCalled();
    await expect(runModelCommand({ select: ['missing'], store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(false).stream, runTui })).rejects.toThrow('not current');
  });

  it('--group --select writes that model group and keeps group models eligible', async () => {
    const store = tempStore();
    await runModelCommand({ group: 'fast', select: ['beta/b:free'], store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(false).stream });
    expect(store.readConfig().modelGroups.fast).toEqual(['beta/b:free']);
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
  });

  it('omits cached failed models from JSON, static output, and --all selection', async () => {
    const store = tempStore();
    store.recordFailure('alpha/a:free', { status: 'failed', httpStatus: 404 });
    const jsonOut = output(false);
    await runModelCommand({ json: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: jsonOut.stream });
    expect((JSON.parse(jsonOut.text()) as any).models.map((model: any) => model.id)).toEqual(['beta/b:free']);

    const allOut = output(false);
    await runModelCommand({ all: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: allOut.stream });
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
    expect(allOut.text()).not.toContain('alpha/a:free');
    expect(allOut.text()).toContain('Beta');
  });

  it('keeps older failed models eligible for reprobe and selection', async () => {
    const store = tempStore();
    store.writeLatency({
      'alpha/a:free': {
        modelId: 'alpha/a:free',
        latencyMs: Number.POSITIVE_INFINITY,
        updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        successes: 0,
        failures: 1,
        lastStatus: 'failed',
      },
    });
    const out = output(false);
    await runModelCommand({ json: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: out.stream });
    expect((JSON.parse(out.text()) as any).models.map((model: any) => model.id)).toEqual(['alpha/a:free', 'beta/b:free']);
  });

  it('--all selects all and non-TTY static output does not open TUI', async () => {
    const store = tempStore();
    const out = output(false);
    const runTui = vi.fn();
    await runModelCommand({ all: true, store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: out.stream, runTui });
    expect(store.readConfig().selectedModelIds).toEqual(['alpha/a:free', 'beta/b:free']);
    expect(out.text()).toContain('Provider');
    expect(out.text()).not.toContain('\u001b');
    expect(runTui).not.toHaveBeenCalled();
  });

  it('--best prints the fastest freshly probed selected model', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free', 'beta/b:free']);
    const out = output(false);
    await runModelCommand({
      best: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      runScheduler: async (options) => {
        for (const model of options.models) {
          const latencyMs = model.id === 'beta/b:free' ? 20 : 50;
          const result = { modelId: model.id, status: 'ok' as const, latencyMs, httpStatus: 200 };
          options.store?.recordSuccess(model.id, latencyMs, { httpStatus: 200 });
          options.onUpdate?.({ modelId: model.id, result });
        }
        return 'completed';
      },
    });
    expect(out.text()).toBe('beta/b:free\n');
    expect(store.readLatency()['beta/b:free']).toMatchObject({ latencyMs: 20, lastStatus: 'ok' });
  });

  it('--best --group probes only configured group candidates', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free', 'beta/b:free']);
    store.updateModelGroup('fast', ['alpha/a:free']);
    const out = output(false);
    const probed: string[] = [];
    await runModelCommand({
      best: true,
      group: 'haiku',
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      runScheduler: async (options) => {
        for (const model of options.models) {
          probed.push(model.id);
          const result = { modelId: model.id, status: 'ok' as const, latencyMs: 10, httpStatus: 200 };
          options.onUpdate?.({ modelId: model.id, result });
        }
        return 'completed';
      },
    });
    expect(probed).toEqual(['alpha/a:free']);
    expect(out.text()).toBe('alpha/a:free\n');
  });

  it('--best --json falls back to cached latency when fresh probes do not succeed', async () => {
    const store = tempStore();
    store.recordSuccess('alpha/a:free', 11);
    const out = output(false);
    await runModelCommand({
      best: true,
      json: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      runScheduler: async (options) => {
        for (const model of options.models) {
          const result = { modelId: model.id, status: 'rate-limited' as const, httpStatus: 429 };
          options.store?.recordFailure?.(model.id, { status: result.status, httpStatus: result.httpStatus });
          options.onUpdate?.({ modelId: model.id, result });
        }
        return 'completed';
      },
    });
    const body = JSON.parse(out.text()) as any;
    expect(body).toMatchObject({ bestModelId: 'alpha/a:free', latencyMs: 11, status: 'cached', probed: false });
  });

  it('can list NVIDIA models without requiring OpenRouter', async () => {
    const store = tempStore();
    const out = output(false);
    const fetchImpl = (async (url: string | URL | Request) => {
      expect(String(url)).toContain('integrate.api.nvidia.com');
      return Response.json({ data: [{ id: 'deepseek-ai/deepseek-v3.2', context_length: 128000 }] });
    }) as typeof fetch;
    await runModelCommand({ json: true, store, fetchImpl, env: { NVIDIA_API_KEY: 'nvapi-key' } as NodeJS.ProcessEnv, stdout: out.stream });
    const body = JSON.parse(out.text()) as any;
    expect(body.models).toMatchObject([{ id: 'nvidia/deepseek-ai/deepseek-v3.2', source: 'nvidia' }]);
  });

  it('--no-tui on a TTY without an interactive stdin skips the picker and prints the static table', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free']);
    const out = output(true);
    const runTui = vi.fn();
    const promptLine = vi.fn();
    await runModelCommand({
      noTui: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      stdin: { isTTY: false } as unknown as NodeJS.ReadStream,
      runTui,
      promptLine,
    });
    expect(runTui).not.toHaveBeenCalled();
    expect(promptLine).not.toHaveBeenCalled();
    expect(out.text()).toContain('Free models:');
    expect(out.text()).toContain('Alpha');
    expect(out.text()).not.toContain('[?1049h');
    expect(store.readConfig().selectedModelIds).toEqual(['alpha/a:free']);
  });

  it('--no-tui on an interactive stdin prompts for rows and saves the selection', async () => {
    const store = tempStore();
    const out = output(true);
    const runTui = vi.fn();
    const promptLine = vi.fn(async ({ question }: { question: string }) => {
      expect(question).toContain('Select rows');
      return '2';
    });
    await runModelCommand({
      noTui: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      stdin: { isTTY: true } as unknown as NodeJS.ReadStream,
      runTui,
      promptLine,
    });
    expect(runTui).not.toHaveBeenCalled();
    expect(promptLine).toHaveBeenCalledOnce();
    expect(out.text()).toContain('Free models:');
    expect(out.text()).toMatch(/\n1\. /);
    expect(out.text()).toMatch(/\n2\. /);
    expect(out.text()).toContain('Saved 1 selection(s).');
    expect(store.readConfig().selectedModelIds.length).toBe(1);
  });

  it('--no-tui prompt accepts mixed row numbers and model IDs and dedupes them', async () => {
    const store = tempStore();
    const out = output(true);
    const promptLine = vi.fn(async () => '1, beta/b:free, 2');
    await runModelCommand({
      noTui: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      stdin: { isTTY: true } as unknown as NodeJS.ReadStream,
      promptLine,
    });
    const saved = store.readConfig().selectedModelIds;
    expect(new Set(saved)).toEqual(new Set(['alpha/a:free', 'beta/b:free']));
    expect(saved.length).toBe(2);
    expect(out.text()).toContain('Saved 2 selection(s).');
  });

  it('--no-tui prompt with blank input keeps the current selection', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free']);
    const out = output(true);
    const promptLine = vi.fn(async () => '');
    await runModelCommand({
      noTui: true,
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      stdin: { isTTY: true } as unknown as NodeJS.ReadStream,
      promptLine,
    });
    expect(store.readConfig().selectedModelIds).toEqual(['alpha/a:free']);
    expect(out.text()).toContain('No change.');
  });

  it('--no-tui prompt with q cancels and sets exit code 130', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      const store = tempStore();
      store.updateSelectedModelIds(['alpha/a:free']);
      const promptLine = vi.fn(async () => 'q');
      await runModelCommand({
        noTui: true,
        store,
        fetchImpl: okFetch(),
        env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
        stdout: output(true).stream,
        stdin: { isTTY: true } as unknown as NodeJS.ReadStream,
        promptLine,
      });
      expect(store.readConfig().selectedModelIds).toEqual(['alpha/a:free']);
      expect(process.exitCode).toBe(130);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('--no-tui prompt rejects unknown tokens', async () => {
    const store = tempStore();
    const promptLine = vi.fn(async () => 'nope');
    await expect(
      runModelCommand({
        noTui: true,
        store,
        fetchImpl: okFetch(),
        env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
        stdout: output(true).stream,
        stdin: { isTTY: true } as unknown as NodeJS.ReadStream,
        promptLine,
      }),
    ).rejects.toThrow('Unknown selection token');
  });

  it('--no-tui --select on a TTY writes the selection and skips the picker', async () => {
    const store = tempStore();
    const out = output(true);
    const runTui = vi.fn();
    await runModelCommand({
      noTui: true,
      select: ['beta/b:free'],
      store,
      fetchImpl: okFetch(),
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      stdout: out.stream,
      runTui,
    });
    expect(runTui).not.toHaveBeenCalled();
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
    expect(out.text()).toContain('Free models:');
  });

  it('TTY default opens injected TUI with current selection', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free']);
    const runTui = vi.fn(async (options) => {
      expect(options.selectedModelIds).toEqual(['alpha/a:free']);
      expect(options.initialTab).toBe('all');
      return { saved: true, interrupted: false, selectedModelIds: ['beta/b:free'], modelGroups: { fast: [], balanced: [], capable: [] }, terminalState: 'aborted' };
    });
    await runModelCommand({ store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(true).stream, runTui });
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
  });

  it('TTY --group edits the requested group', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free']);
    store.updateModelGroup('balanced', ['alpha/a:free']);
    const runTui = vi.fn(async (options) => {
      expect(options.selectedModelIds).toEqual(['alpha/a:free']);
      expect(options.modelGroups.balanced).toEqual(['alpha/a:free']);
      expect(options.initialTab).toBe('balanced');
      return { saved: true, interrupted: false, selectedModelIds: ['alpha/a:free', 'beta/b:free'], modelGroups: { fast: [], balanced: ['beta/b:free'], capable: [] }, terminalState: 'aborted' };
    });
    await runModelCommand({ group: 'sonnet', store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(true).stream, runTui });
    expect(store.readConfig().modelGroups.balanced).toEqual(['beta/b:free']);
    expect(store.readConfig().selectedModelIds).toEqual(['alpha/a:free', 'beta/b:free']);
  });
});
