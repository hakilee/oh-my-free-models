import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config/store.js';
import { getStatus } from '../src/commands/status.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe('status command', () => {
  it('reports the same best route the request router would use', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-status-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['timed-out:free', 'ready:free']);
    store.writeLatency({
      'timed-out:free': { modelId: 'timed-out:free', latencyMs: 100, updatedAt: '', successes: 1, failures: 1, lastStatus: 'timeout' },
      'ready:free': { modelId: 'ready:free', latencyMs: 200, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' },
    });

    expect(getStatus(store).bestModel).toEqual({ id: 'ready:free', latencyMs: 200, reason: 'lowest-latency' });
  });
});
