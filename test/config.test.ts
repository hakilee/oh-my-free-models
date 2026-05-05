import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDotEnv, resolveNvidiaApiKey, resolveOpenRouterApiKey } from '../src/config/env.js';
import { ConfigStore, MODEL_CACHE_TTL_MS, isModelCacheFresh } from '../src/config/store.js';

const roots: string[] = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-test-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe('config/env', () => {
  it('uses process OPENROUTER_API_KEY before local .env', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'OPENROUTER_API_KEY=local\n');
    expect(resolveOpenRouterApiKey({ OPENROUTER_API_KEY: 'global' } as NodeJS.ProcessEnv, root)).toBe('global');
  });

  it('falls back to ~/.oh-my-free-models/.env equivalent', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'OPENROUTER_API_KEY="local-key"\n');
    expect(resolveOpenRouterApiKey({} as NodeJS.ProcessEnv, root)).toBe('local-key');
  });

  it('resolves NVIDIA_API_KEY from process and local env', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'NVIDIA_API_KEY=local-nv\n');
    expect(resolveNvidiaApiKey({ NVIDIA_API_KEY: 'global-nv' } as NodeJS.ProcessEnv, root)).toBe('global-nv');
    expect(resolveNvidiaApiKey({} as NodeJS.ProcessEnv, root)).toBe('local-nv');
  });

  it('parses dotenv comments and quotes', () => {
    expect(parseDotEnv('# hi\nA=1\nB="two"\n')).toEqual({ A: '1', B: 'two' });
  });

  it('persists selected models and latency observations', () => {
    const store = new ConfigStore(tempRoot());
    store.updateSelectedModelIds(['a', 'b', 'a']);
    store.updateModelGroup('fast', ['b', 'b']);
    store.recordSuccess('b', 123, { httpStatus: 200 });
    store.recordFailure('c', { status: 'rate-limited', httpStatus: 429 });
    const again = new ConfigStore(store.paths.root);
    expect(again.readConfig().selectedModelIds).toEqual(['a', 'b']);
    expect(again.readConfig().modelGroups.fast).toEqual(['b']);
    expect(again.readLatency().b).toMatchObject({ latencyMs: 123, lastStatus: 'ok', lastHttpStatus: 200 });
    expect(again.readLatency().c).toMatchObject({ failures: 1, lastStatus: 'rate-limited', lastHttpStatus: 429 });
  });

  it('persists model usage counters and token totals', () => {
    const store = new ConfigStore(tempRoot());
    store.recordUsage('a', { success: true, inputTokens: 3, outputTokens: 4, httpStatus: 200 });
    store.recordUsage('a', { success: false, httpStatus: 429, status: 'rate-limited' });
    expect(new ConfigStore(store.paths.root).readUsage().a).toMatchObject({
      requests: 2,
      successes: 1,
      failures: 1,
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      lastStatus: 'rate-limited',
      lastHttpStatus: 429,
    });
  });

  it('defaults missing model groups for existing configs', () => {
    const store = new ConfigStore(tempRoot());
    fs.mkdirSync(store.paths.root, { recursive: true });
    fs.writeFileSync(store.paths.configPath, '{"port":1234,"selectedModelIds":["a"]}\n');
    expect(store.readConfig()).toMatchObject({
      port: 1234,
      selectedModelIds: ['a'],
      modelGroups: { fast: [], balanced: [], capable: [] },
    });
  });

  it('sets cooldownUntil on rate-limit/quota failures and skips it for transient errors', () => {
    const store = new ConfigStore(tempRoot());
    const before = Date.now();
    store.recordFailure('rl', { status: 'rate-limited', httpStatus: 429 });
    store.recordFailure('quota', { status: 'quota', httpStatus: 402 });
    store.recordFailure('http429', { httpStatus: 429 });
    store.recordFailure('http402', { httpStatus: 402 });
    store.recordFailure('http500', { status: 'failed', httpStatus: 500 });
    const all = store.readLatency();
    for (const id of ['rl', 'quota', 'http429', 'http402']) {
      const cooldown = Date.parse(all[id]!.cooldownUntil!);
      expect(cooldown).toBeGreaterThanOrEqual(before + 60_000);
    }
    expect(all.http500!.cooldownUntil).toBeUndefined();
  });

  it('treats model cache as fresh for 5 minutes', () => {
    const now = Date.parse('2026-05-03T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      expect(isModelCacheFresh({ models: [], fetchedAt: new Date(now - MODEL_CACHE_TTL_MS + 1).toISOString() })).toBe(true);
      expect(isModelCacheFresh({ models: [], fetchedAt: new Date(now - MODEL_CACHE_TTL_MS).toISOString() })).toBe(false);
      expect(isModelCacheFresh({ models: [], fetchedAt: 'not-a-date' })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
