import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { runModelTui } from '../src/commands/model-tui.js';
import { cleanupTempRoots, sampleModels, tempStore } from './helpers.js';

class FakeInput extends EventEmitter {
  isTTY = true;
  rawModes: boolean[] = [];
  resumed = false;
  paused = false;
  setRawMode(mode: boolean) { this.rawModes.push(mode); }
  resume() { this.resumed = true; }
  pause() { this.paused = true; }
  send(text: string) { this.emit('data', Buffer.from(text)); }
}

class FakeOutput {
  isTTY = true;
  columns = 120;
  rows = 24;
  chunks: string[] = [];
  write(chunk: string) { this.chunks.push(chunk); }
  text() { return this.chunks.join(''); }
}

function latestFrame(text: string): string {
  const marker = '\u001b[H';
  const index = text.lastIndexOf(marker);
  return index >= 0 ? text.slice(index) : text;
}

afterEach(cleanupTempRoots);

describe('model TUI', () => {
  it('renders immediately with required controls and no disallowed labels', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: ['alpha/one:free'],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });
    expect(output.text()).toContain('Provider');
    expect(output.text()).toContain('Ctx');
    expect(output.text()).toContain('Lat');
    expect(output.text()).toContain('Status');
    expect(output.text()).toContain('▶ current');
    expect(output.text()).toContain('● in active tab');
    expect(output.text()).toContain('○ not in tab');
    expect(output.text()).toContain('All 1');
    expect(output.text()).toContain('Fast 0');
    expect(output.text()).toContain('Balanced 0');
    expect(output.text()).toContain('Capable 0');
    expect(output.text()).toContain('Tab/h/l switch');
    expect(output.text()).toContain('\u001b[7m');
    expect(output.text()).toContain('\u001b[?1049h');
    expect(output.text()).toContain('\u001b[?1000h');
    expect(output.text()).toContain('\u001b[?1006h');
    expect(output.text()).not.toContain('\u001b[2J');
    expect(output.text().toLowerCase()).not.toContain('search');
    expect(output.text().toLowerCase()).not.toContain('sort');
    expect(output.text().toLowerCase()).not.toContain('tier');
    expect(output.text().toLowerCase()).not.toContain('ranking');
    input.send('q');
    await promise;
  });

  it('switches tabs and saves model-group selections from the default TUI', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: [],
      modelGroups: { fast: [], balanced: [], capable: [] },
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });

    input.send('\t');
    input.send('\u001b[D');
    input.send('\u001b[C');
    input.send(' ');
    input.send('\r');

    await expect(promise).resolves.toMatchObject({
      saved: true,
      selectedModelIds: ['alpha/one:free'],
      modelGroups: { fast: ['alpha/one:free'], balanced: [], capable: [] },
    });
  });

  it('toggles, moves, saves, aborts scheduler, and restores terminal', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    let aborted = false;
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: ['alpha/one:free'],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async ({ signal }) => {
        signal?.addEventListener('abort', () => { aborted = true; });
        return new Promise(() => undefined);
      },
    });
    input.send('j');
    input.send(' ');
    input.send('\r');
    const result = await promise;
    expect(result.saved).toBe(true);
    expect(result.selectedModelIds).toEqual(['alpha/one:free', 'beta/two:free']);
    expect(aborted).toBe(true);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(true);
    expect(output.text()).toContain('\u001b[?1000l');
    expect(output.text()).toContain('\u001b[?1006l');
    expect(output.text()).toContain('\u001b[?25h');
    expect(output.text()).toContain('\u001b[?1049l');
  });

  it('saves selected models in displayed recommendation order', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    store.recordSuccess('beta/two:free', 20);
    store.recordSuccess('alpha/one:free', 200);

    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: ['alpha/one:free', 'beta/two:free'],
      store,
      apiKey: 'k',
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });

    input.send('\r');
    await expect(promise).resolves.toMatchObject({ saved: true, selectedModelIds: ['beta/two:free', 'alpha/one:free'] });
  });

  it('can render multiple rows as probing from a parallel scheduler batch', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: [],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      fetchImpl: (async () => new Promise(() => undefined)) as any,
      runScheduler: async ({ models, probe, signal }) => {
        void probe(models[0]!, signal);
        void probe(models[1]!, signal);
        return new Promise(() => undefined);
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(output.text().match(/probing/g)?.length).toBeGreaterThanOrEqual(2);
    input.send('q');
    await promise;
  });

  it('removes a row when probing marks the model failed', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: ['alpha/one:free'],
      modelGroups: { fast: ['alpha/one:free'], balanced: [], capable: [] },
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async ({ onUpdate }) => {
        onUpdate?.({
          modelId: 'alpha/one:free',
          result: { modelId: 'alpha/one:free', status: 'failed' },
        });
        return 'completed';
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = latestFrame(output.text());
    expect(frame).not.toContain('alpha/one:free');
    expect(frame).not.toContain('failed');
    expect(frame).toContain('All 0');
    input.send('\r');
    await expect(promise).resolves.toMatchObject({ saved: true, selectedModelIds: [], modelGroups: { fast: [], balanced: [], capable: [] } });
  });

  it('keeps row-level rate limits non-terminal while later rows update', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const store = tempStore();
    const promise = runModelTui({
      models: sampleModels,
      selectedModelIds: [],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async ({ onUpdate }) => {
        onUpdate?.({
          modelId: 'alpha/one:free',
          result: { modelId: 'alpha/one:free', status: 'rate-limited' },
        });
        onUpdate?.({
          modelId: 'beta/two:free',
          result: { modelId: 'beta/two:free', status: 'ok', latencyMs: 22 },
        });
        return 'completed';
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const text = output.text();
    expect(text).toContain('rate-limit');
    expect(text).toContain('22ms');
    expect(text).toContain('\u001b[32m22ms\u001b[0m');
    expect(text).not.toContain('quota/payment limit reached');
    input.send('q');
    await promise;
  });

  it('keeps long model lists inside a terminal-sized scrolling viewport', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    output.rows = 8;
    output.columns = 90;
    const store = tempStore();
    const manyModels = Array.from({ length: 20 }, (_, index) => ({
      id: `provider/model-${String(index + 1).padStart(2, '0')}:free`,
      name: index === 0 ? 'Model 01 With A Longer Display Name' : `Model ${String(index + 1).padStart(2, '0')}`,
      provider: index === 0 ? 'very-long-provider-name' : 'p',
      source: 'openrouter' as const,
      contextLength: 8192,
    }));
    const promise = runModelTui({
      models: manyModels,
      selectedModelIds: [],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });

    let frame = latestFrame(output.text());
    expect(frame).toContain('Rows 1-4/20');
    expect(frame).toContain('Model 01');
    expect(frame).not.toContain('Model 20');
    expect(frame.split('\n').length - 1).toBeLessThanOrEqual(output.rows);
    const firstHeader = frame.split('\n').find((line) => line.includes('Cur Sel'));

    input.send('\u001b[6~');
    frame = latestFrame(output.text());
    expect(frame).toContain('Rows 5-8/20');
    expect(frame).toContain('Model 05');
    expect(frame).not.toContain('Model 01');
    expect(frame.split('\n').length - 1).toBeLessThanOrEqual(output.rows);
    expect(frame.split('\n').find((line) => line.includes('Cur Sel'))).toBe(firstHeader);

    input.send('q');
    await promise;
  });

  it('scrolls the viewport one row per mouse wheel event', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    output.rows = 8;
    const store = tempStore();
    const manyModels = Array.from({ length: 20 }, (_, index) => ({
      id: `provider/model-${String(index + 1).padStart(2, '0')}:free`,
      name: `Model ${String(index + 1).padStart(2, '0')}`,
      provider: 'provider',
      source: 'openrouter' as const,
      contextLength: 8192,
    }));
    const promise = runModelTui({
      models: manyModels,
      selectedModelIds: [],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });

    input.send('\u001b[<65;10;5M');
    let frame = latestFrame(output.text());
    expect(frame).toContain('Rows 2-5/20');
    expect(frame).toContain('Model 02');

    input.send('\u001b[<65;10;5M');
    frame = latestFrame(output.text());
    expect(frame).toContain('Rows 3-6/20');
    expect(frame).toContain('Model 03');

    input.send('\u001b[<64;10;5M');
    frame = latestFrame(output.text());
    expect(frame).toContain('Rows 2-5/20');
    expect(frame).toContain('Model 02');

    input.send('q');
    await promise;
  });

  it('does not write a trailing newline that scrolls and duplicates the header', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    output.rows = 8;
    const store = tempStore();
    const manyModels = Array.from({ length: 20 }, (_, index) => ({
      id: `provider/model-${String(index + 1).padStart(2, '0')}:free`,
      name: `Model ${String(index + 1).padStart(2, '0')}`,
      provider: 'provider',
      source: 'openrouter' as const,
      contextLength: 8192,
    }));
    const promise = runModelTui({
      models: manyModels,
      selectedModelIds: [],
      store,
      apiKeys: { openrouter: 'k' },
      stdin: input as any,
      stdout: output as any,
      runScheduler: async () => new Promise(() => undefined),
    });

    input.send('\u001b[<65;10;5M');
    const frame = latestFrame(output.text());
    expect(frame).not.toMatch(/\n\u001b\[J$/);
    expect(frame.split('\n').length).toBeLessThanOrEqual(output.rows);

    input.send('q');
    await promise;
  });

  it('cancels without saving on q and exits interrupted on Ctrl+C', async () => {
    const store = tempStore();
    const input = new FakeInput();
    const cancelPromise = runModelTui({ models: sampleModels, selectedModelIds: ['alpha/one:free'], store, apiKeys: { openrouter: 'k' }, stdin: input as any, stdout: new FakeOutput() as any, runScheduler: async () => new Promise(() => undefined) });
    input.send(' ');
    input.send('q');
    await expect(cancelPromise).resolves.toMatchObject({ saved: false, selectedModelIds: ['alpha/one:free'], interrupted: false });

    const input2 = new FakeInput();
    const interruptPromise = runModelTui({ models: sampleModels, selectedModelIds: [], store, apiKeys: { openrouter: 'k' }, stdin: input2 as any, stdout: new FakeOutput() as any, runScheduler: async () => new Promise(() => undefined) });
    input2.send('\u0003');
    await expect(interruptPromise).resolves.toMatchObject({ saved: false, interrupted: true });
  });
});
