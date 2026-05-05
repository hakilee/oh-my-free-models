import { describe, expect, it } from 'vitest';
import { buildModelRows, FAILED_MODEL_HIDE_TTL_MS, filterListableModelRows, formatContextLength, formatLatency, formatRecommendation, recommendModel, renderStaticModelTable, sortModelRows, stripAnsi } from '../src/commands/model-view.js';
import { OmfmModel } from '../src/types.js';

const models: OmfmModel[] = [
  { id: 'alpha/a:free', name: 'Alpha', provider: 'alpha', source: 'openrouter', contextLength: 8192 },
  { id: 'nvidia/beta/b', upstreamId: 'beta/b', name: 'Beta', provider: 'nvidia', source: 'nvidia', contextLength: 1_000_000 },
];

describe('model view formatting', () => {
  it('formats context sizes compactly', () => {
    expect(formatContextLength()).toBe('—');
    expect(formatContextLength(8192)).toBe('8k');
    expect(formatContextLength(128000)).toBe('128k');
    expect(formatContextLength(1_000_000)).toBe('1.0M');
  });

  it('formats unknown and known latency', () => {
    expect(formatLatency()).toBe('—');
    expect(formatLatency(123.4)).toBe('123ms');
  });

  it('renders an ANSI-free static table with required columns', () => {
    const rows = buildModelRows(models, new Set(['nvidia/beta/b']), {
      'alpha/a:free': { modelId: 'alpha/a:free', latencyMs: 55, updatedAt: 'now', successes: 1, failures: 0 },
    });
    const table = renderStaticModelTable(rows);
    expect(table).toContain('Provider');
    expect(table).toContain('Source');
    expect(table).toContain('Recommend');
    expect(table).toContain('OpenRouter');
    expect(table).toContain('NVIDIA');
    expect(table).toContain('Ctx');
    expect(table).toContain('Lat');
    expect(table).toContain('Status');
    expect(table).toContain('8k');
    expect(table).toContain('55ms');
    expect(stripAnsi(table)).toBe(table);
  });

  it('uses persisted non-ok status when no finite latency is cached', () => {
    const rows = buildModelRows(models, new Set(), {
      'alpha/a:free': { modelId: 'alpha/a:free', latencyMs: Number.POSITIVE_INFINITY, updatedAt: 'now', successes: 0, failures: 1, lastStatus: 'rate-limited', lastHttpStatus: 429 },
    });
    expect(rows[0].status).toBe('rate-limited');
    expect(rows[0].latencyMs).toBeUndefined();
    expect(renderStaticModelTable(rows)).toContain('rate-limit');
  });

  it('formats recommendation marks from latency health', () => {
    expect(formatRecommendation(recommendModel({ status: 'ok', latencyMs: 300, model: models[0] }))).toBe('strong');
    expect(formatRecommendation(recommendModel({ status: 'ok', latencyMs: 1200, model: models[0] }))).toBe('good');
    expect(formatRecommendation(recommendModel({ status: 'ok', latencyMs: 2500, model: models[0] }))).toBe('weak');
    expect(formatRecommendation(recommendModel({ status: 'failed', latencyMs: 10, model: models[0] }))).toBe('—');
  });

  it('temporarily filters recently failed rows from user-facing model lists', () => {
    const now = Date.now();
    const latency = {
      'alpha/a:free': { modelId: 'alpha/a:free', latencyMs: Number.POSITIVE_INFINITY, updatedAt: new Date(now - 1_000).toISOString(), successes: 0, failures: 1, lastStatus: 'failed' },
    };
    const rows = buildModelRows(models, new Set(), latency);

    expect(filterListableModelRows(rows, latency, { now: () => now }).map((row) => row.model.id)).toEqual(['nvidia/beta/b']);
  });

  it('keeps older failed rows listable so they can be probed again', () => {
    const now = Date.now();
    const latency = {
      'alpha/a:free': { modelId: 'alpha/a:free', latencyMs: Number.POSITIVE_INFINITY, updatedAt: new Date(now - FAILED_MODEL_HIDE_TTL_MS - 1).toISOString(), successes: 0, failures: 1, lastStatus: 'failed' },
    };
    const rows = buildModelRows(models, new Set(), latency);

    expect(filterListableModelRows(rows, latency, { now: () => now }).map((row) => row.model.id)).toEqual(['alpha/a:free', 'nvidia/beta/b']);
  });

  it('sorts rows by selection, recommendation health, latency, and catalog rank', () => {
    const rows = buildModelRows([
      { id: 'z/pending:free', name: 'Pending', provider: 'z', source: 'openrouter', popularityRank: 0 },
      { id: 'a/slow:free', name: 'Slow', provider: 'a', source: 'openrouter', popularityRank: 1 },
      { id: 'b/fast:free', name: 'Fast', provider: 'b', source: 'openrouter', popularityRank: 2 },
      { id: 'c/failed:free', name: 'Failed', provider: 'c', source: 'openrouter', popularityRank: 3 },
    ], new Set(['a/slow:free']), {
      'a/slow:free': { modelId: 'a/slow:free', latencyMs: 900, updatedAt: 'now', successes: 1, failures: 0, lastStatus: 'ok' },
      'b/fast:free': { modelId: 'b/fast:free', latencyMs: 100, updatedAt: 'now', successes: 1, failures: 0, lastStatus: 'ok' },
      'c/failed:free': { modelId: 'c/failed:free', latencyMs: Number.POSITIVE_INFINITY, updatedAt: 'now', successes: 0, failures: 1, lastStatus: 'failed' },
    });

    expect(sortModelRows(rows).map((row) => row.model.id)).toEqual(['b/fast:free', 'a/slow:free', 'z/pending:free', 'c/failed:free']);
    expect(sortModelRows(rows, { selectedFirst: true }).map((row) => row.model.id)).toEqual(['a/slow:free', 'b/fast:free', 'z/pending:free', 'c/failed:free']);
  });

  it('can color recommendation marks without adding check icons', () => {
    const value = formatRecommendation('strong', { color: true });
    expect(value).toContain('\u001b[32m');
    expect(stripAnsi(value)).toBe('strong');
    expect(value).not.toContain('✓');
  });

  it('can color latency using the same health thresholds', () => {
    expect(formatLatency(300, { color: true })).toContain('\u001b[32m');
    expect(formatLatency(1200, { color: true })).toContain('\u001b[33m');
    expect(formatLatency(2500, { color: true })).toContain('\u001b[31m');
    expect(stripAnsi(formatLatency(300, { color: true }))).toBe('300ms');
    expect(formatLatency(undefined, { color: true })).toBe('—');
  });

  it('renders interactive focus and selection markers distinctly', () => {
    const rows = buildModelRows(models, new Set(['nvidia/beta/b']), {});
    const table = renderStaticModelTable(rows, { activeIndex: 1, interactive: true });
    expect(table).toContain('Cur');
    expect(table).toContain('▶');
    expect(table).toContain('●');
    expect(table).toContain('○');
    expect(table).toContain('\u001b[7m');
    expect(table).toContain('\u001b[48;5;236m');
    expect(stripAnsi(table)).not.toContain('\u001b[7m');
  });
});
