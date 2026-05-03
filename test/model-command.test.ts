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

  it('TTY default opens injected TUI with current selection', async () => {
    const store = tempStore();
    store.updateSelectedModelIds(['alpha/a:free']);
    const runTui = vi.fn(async (options) => {
      expect(options.selectedModelIds).toEqual(['alpha/a:free']);
      return { saved: true, interrupted: false, selectedModelIds: ['beta/b:free'], terminalState: 'aborted' };
    });
    await runModelCommand({ store, fetchImpl: okFetch(), env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv, stdout: output(true).stream, runTui });
    expect(store.readConfig().selectedModelIds).toEqual(['beta/b:free']);
  });
});
