import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseModel, orderedCandidates } from '../src/latency/router.js';

const NOW = Date.parse('2026-05-03T12:00:00.000Z');

describe('latency router', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('honors requested selected model', () => {
    expect(chooseModel(['a', 'b'], { a: { modelId: 'a', latencyMs: 1, updatedAt: '', successes: 1, failures: 0 } }, 'b')).toEqual({ modelId: 'b', reason: 'requested-selected' });
  });

  it('selects lowest observed latency for generic request', () => {
    const choice = chooseModel(['a', 'b'], {
      a: { modelId: 'a', latencyMs: 200, updatedAt: '', successes: 1, failures: 0 },
      b: { modelId: 'b', latencyMs: 50, updatedAt: '', successes: 1, failures: 0 },
    }, 'auto');
    expect(choice).toEqual({ modelId: 'b', reason: 'lowest-latency' });
  });

  it('falls back deterministically when latency is unknown', () => {
    expect(chooseModel(['z', 'a'], {}, undefined)).toEqual({ modelId: 'z', reason: 'fallback-order' });
  });

  it('orders retry candidates without parallel fanout', () => {
    expect(orderedCandidates(['a', 'b', 'c'], { b: { modelId: 'b', latencyMs: 5, updatedAt: '', successes: 1, failures: 0 } })).toEqual(['b', 'a', 'c']);
  });

  it('preserves selected order when retry candidate latency ties', () => {
    const observations = {
      a: { modelId: 'a', latencyMs: 50, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' as const },
      b: { modelId: 'b', latencyMs: 50, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' as const },
      c: { modelId: 'c', latencyMs: 10, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' as const },
    };
    expect(orderedCandidates(['b', 'a', 'c'], observations, 'c')).toEqual(['c', 'b', 'a']);
  });

  it('skips models in active cooldown when picking the lowest latency model', () => {
    const choice = chooseModel(['a', 'b'], {
      a: { modelId: 'a', latencyMs: 10, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited', cooldownUntil: new Date(NOW + 60_000).toISOString() },
      b: { modelId: 'b', latencyMs: 100, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' },
    }, 'auto');
    expect(choice).toEqual({ modelId: 'b', reason: 'lowest-latency' });
  });

  it('treats expired cooldowns as available again', () => {
    const choice = chooseModel(['a', 'b'], {
      a: { modelId: 'a', latencyMs: 10, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited', cooldownUntil: new Date(NOW - 1).toISOString() },
      b: { modelId: 'b', latencyMs: 100, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' },
    }, 'auto');
    expect(choice).toEqual({ modelId: 'a', reason: 'lowest-latency' });
  });

  it('falls back to all selected models when every model is in cooldown', () => {
    const choice = chooseModel(['a', 'b'], {
      a: { modelId: 'a', latencyMs: 100, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited', cooldownUntil: new Date(NOW + 60_000).toISOString() },
      b: { modelId: 'b', latencyMs: 50, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited', cooldownUntil: new Date(NOW + 60_000).toISOString() },
    }, 'auto');
    expect(choice).toEqual({ modelId: 'b', reason: 'lowest-latency' });
  });

  it('still honors explicit selection of a cooldown model', () => {
    const choice = chooseModel(['a', 'b'], {
      a: { modelId: 'a', latencyMs: 10, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited', cooldownUntil: new Date(NOW + 60_000).toISOString() },
    }, 'a');
    expect(choice).toEqual({ modelId: 'a', reason: 'requested-selected' });
  });

  it('orders cooldown models last in retry candidates and ok models before failed ones', () => {
    const observations = {
      a: { modelId: 'a', latencyMs: 10, updatedAt: '', successes: 1, failures: 5, lastStatus: 'rate-limited' as const, cooldownUntil: new Date(NOW + 60_000).toISOString() },
      b: { modelId: 'b', latencyMs: 100, updatedAt: '', successes: 1, failures: 0, lastStatus: 'ok' as const },
      c: { modelId: 'c', latencyMs: 50, updatedAt: '', successes: 1, failures: 1, lastStatus: 'failed' as const },
    };
    expect(orderedCandidates(['a', 'b', 'c'], observations)).toEqual(['b', 'c', 'a']);
  });
});
