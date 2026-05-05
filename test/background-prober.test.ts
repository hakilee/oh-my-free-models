import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { probeSelectedModels } from '../src/latency/background-prober.js';
import { ConfigStore } from '../src/config/store.js';
import { OmfmModel } from '../src/types.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

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
      env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv,
      runScheduler: async () => {
        called = true;
        return 'completed';
      },
    });
    expect(called).toBe(false);
  });
});
