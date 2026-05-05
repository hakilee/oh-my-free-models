import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeSelectedModels, startBackgroundLatencyProber } from '../src/latency/background-prober.js';
import { ConfigStore } from '../src/config/store.js';
import { OmfmModel } from '../src/types.js';

const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function tempStore(models: OmfmModel[]): ConfigStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-bg-probe-'));
  roots.push(root);
  const store = new ConfigStore(root);
  store.updateSelectedModelIds(models.map((model) => model.id));
  store.writeModelCache({ models, fetchedAt: new Date().toISOString() });
  return store;
}

describe('background latency prober', () => {
  it('probes selected cached models and records scheduler results', async () => {
    const store = tempStore([
      { id: 'alpha/a:free', name: 'Alpha', provider: 'alpha', source: 'openrouter' },
      { id: 'beta/b:free', name: 'Beta', provider: 'beta', source: 'openrouter' },
    ]);
    const probed: string[] = [];
    await probeSelectedModels({
      store,
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      runScheduler: async (options) => {
        probed.push(...options.models.map((model) => model.id));
        options.store?.recordSuccess(options.models[0]!.id, 33);
        return 'completed';
      },
    });
    expect(probed).toEqual(['alpha/a:free', 'beta/b:free']);
    expect(store.readLatency()['alpha/a:free']).toMatchObject({ latencyMs: 33, lastStatus: 'ok' });
  });

  it('does nothing when no models are selected', async () => {
    const store = tempStore([{ id: 'alpha/a:free', name: 'Alpha', provider: 'alpha', source: 'openrouter' }]);
    store.updateSelectedModelIds([]);
    let called = false;
    await probeSelectedModels({
      store,
      env: {} as NodeJS.ProcessEnv,
      runScheduler: async () => {
        called = true;
        return 'completed';
      },
    });
    expect(called).toBe(false);
  });

  it('aborts an in-flight scheduler run when stopped', async () => {
    vi.useFakeTimers();
    const store = tempStore([{ id: 'alpha/a:free', name: 'Alpha', provider: 'alpha', source: 'openrouter' }]);
    let schedulerSignal: AbortSignal | undefined;
    const prober = startBackgroundLatencyProber({
      store,
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      initialDelayMs: 1,
      intervalMs: 10_000,
      runScheduler: async (options) => {
        schedulerSignal = options.signal;
        return new Promise((resolve) => {
          options.signal?.addEventListener('abort', () => resolve('aborted'), { once: true });
        });
      },
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(schedulerSignal?.aborted).toBe(false);

    prober.stop();
    expect(schedulerSignal?.aborted).toBe(true);
  });

  it('reports background probe errors through the error hook', async () => {
    vi.useFakeTimers();
    const store = tempStore([{ id: 'alpha/a:free', name: 'Alpha', provider: 'alpha', source: 'openrouter' }]);
    const errors: unknown[] = [];
    const prober = startBackgroundLatencyProber({
      store,
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      initialDelayMs: 1,
      intervalMs: 10_000,
      onError: (error) => errors.push(error),
      runScheduler: async () => {
        throw new Error('probe failed');
      },
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    prober.stop();
  });
});
