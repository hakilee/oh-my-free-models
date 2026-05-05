import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runUsageCommand } from '../src/commands/usage.js';
import { ConfigStore } from '../src/config/store.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function tempStore(): ConfigStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-usage-'));
  roots.push(root);
  return new ConfigStore(root);
}

function output() {
  let text = '';
  return {
    stream: { write: (chunk: string) => { text += chunk; } },
    text: () => text,
  };
}

describe('usage command', () => {
  it('prints model usage sorted by request count', () => {
    const store = tempStore();
    store.recordUsage('beta', { success: true });
    store.recordUsage('alpha', { success: true, inputTokens: 1, outputTokens: 2 });
    store.recordUsage('alpha', { success: false });
    const out = output();
    runUsageCommand({ store, stdout: out.stream });
    expect(out.text()).toContain('Model');
    expect(out.text().indexOf('alpha')).toBeLessThan(out.text().indexOf('beta'));
    expect(out.text()).toContain('3');
  });

  it('prints json usage', () => {
    const store = tempStore();
    store.recordUsage('alpha', { success: true, totalTokens: 5 });
    const out = output();
    runUsageCommand({ store, stdout: out.stream, json: true });
    expect(JSON.parse(out.text())).toMatchObject({ usage: [{ modelId: 'alpha', requests: 1, totalTokens: 5 }] });
  });
});
