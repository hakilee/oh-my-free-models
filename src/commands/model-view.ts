import { LatencyObservation, OmfmModel } from '../types.js';

export type ModelProbeStatus = 'pending' | 'cached' | 'probing' | 'ok' | 'quota' | 'rate-limited' | 'payment' | 'timeout' | 'aborted' | 'failed' | 'deferred';

export interface ModelDisplayRow {
  model: OmfmModel;
  selected: boolean;
  latencyMs?: number;
  status: ModelProbeStatus;
  recommendation: RecommendationMark;
  catalogIndex?: number;
}

export interface ModelTableRenderOptions {
  activeIndex?: number;
  colorLatency?: boolean;
  colorRecommendation?: boolean;
  interactive?: boolean;
  maxWidth?: number;
  measureRows?: ModelDisplayRow[];
  minBodyRows?: number;
}

const CONTROL_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:[\d]{1,4}(?:;[\d]{0,4})*)?[\dA-PR-TZcf-nq-uy=><]/g;
const ANSI_AT_START_PATTERN = /^[\u001b\u009b][[\]()#;?]*(?:[\d]{1,4}(?:;[\d]{0,4})*)?[\dA-PR-TZcf-nq-uy=><]/;
const INVERSE = '\u001b[7m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const RED = '\u001b[31m';
const SELECTED_BG = '\u001b[48;5;236m';
const RESET = '\u001b[0m';

export const FAILED_MODEL_HIDE_TTL_MS = 5 * 60 * 1000;

export type RecommendationMark = 'strong' | 'good' | 'weak' | 'none' | 'pending';

export function hasAnsiControl(value: string): boolean {
  const withoutAnsi = stripAnsi(value);
  return withoutAnsi !== value || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(withoutAnsi);
}

export function stripAnsi(value: string): string {
  return value.replace(CONTROL_PATTERN, '');
}

function stripControls(value: string): string {
  return stripAnsi(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
}

export function formatContextLength(contextLength?: number): string {
  if (typeof contextLength !== 'number' || !Number.isFinite(contextLength) || contextLength <= 0) return '—';
  if (contextLength >= 1_000_000) {
    const millions = contextLength / 1_000_000;
    return `${millions.toFixed(1)}M`;
  }
  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}k`;
  }
  return String(contextLength);
}

export function formatLatency(latencyMs?: number, options: { color?: boolean } = {}): string {
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) return '—';
  const label = `${Math.round(latencyMs)}ms`;
  if (!options.color) return label;
  if (latencyMs <= 800) return `${GREEN}${label}${RESET}`;
  if (latencyMs <= 1_500) return `${YELLOW}${label}${RESET}`;
  return `${RED}${label}${RESET}`;
}

export function latencyFor(modelId: string, latency: Record<string, LatencyObservation>): number | undefined {
  const value = latency[modelId]?.latencyMs;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function observedStatus(observation: LatencyObservation | undefined, fallback: ModelProbeStatus): ModelProbeStatus {
  if (!observation?.lastStatus) return fallback;
  if (observation.lastStatus === 'ok') {
    const value = observation.latencyMs;
    return typeof value === 'number' && Number.isFinite(value) ? 'cached' : fallback;
  }
  if (
    observation.lastStatus === 'rate-limited' ||
    observation.lastStatus === 'payment' ||
    observation.lastStatus === 'timeout' ||
    observation.lastStatus === 'aborted' ||
    observation.lastStatus === 'failed'
  ) {
    return observation.lastStatus;
  }
  return fallback;
}

export function recommendModel(row: { latencyMs?: number; status: ModelProbeStatus; model?: OmfmModel }): RecommendationMark {
  if (row.status === 'failed' || row.status === 'timeout' || row.status === 'payment' || row.status === 'quota' || row.status === 'rate-limited' || row.status === 'deferred' || row.status === 'aborted') {
    return 'none';
  }
  if (typeof row.latencyMs !== 'number' || !Number.isFinite(row.latencyMs)) return 'pending';
  const contextBonus = (row.model?.contextLength ?? 0) >= 100_000 ? 100 : 0;
  const adjusted = Math.max(0, row.latencyMs - contextBonus);
  if (adjusted <= 800) return 'strong';
  if (adjusted <= 1_500) return 'good';
  if (adjusted <= 3_000) return 'weak';
  return 'none';
}

export function formatRecommendation(mark: RecommendationMark, options: { color?: boolean } = {}): string {
  const label = mark === 'pending' || mark === 'none' ? '—' : mark;
  if (!options.color) return label;
  if (mark === 'strong') return `${GREEN}${label}${RESET}`;
  if (mark === 'good') return `${YELLOW}${label}${RESET}`;
  if (mark === 'weak') return `${RED}${label}${RESET}`;
  return label;
}

export function buildModelRows(models: OmfmModel[], selectedIds: Set<string>, latency: Record<string, LatencyObservation>, status: ModelProbeStatus = 'pending'): ModelDisplayRow[] {
  return models.map((model, catalogIndex) => {
    const latencyMs = latencyFor(model.id, latency);
    const cachedStatus = status === 'pending' && latencyMs !== undefined ? 'cached' : status;
    const nextStatus = status === 'pending' ? observedStatus(latency[model.id], cachedStatus) : cachedStatus;
    return {
      model,
      selected: selectedIds.has(model.id),
      latencyMs,
      status: nextStatus,
      recommendation: recommendModel({ latencyMs, status: nextStatus, model }),
      catalogIndex,
    };
  });
}

const RECOMMENDATION_ORDER: Record<RecommendationMark, number> = {
  strong: 0,
  good: 1,
  weak: 2,
  pending: 3,
  none: 4,
};

const UNHEALTHY_STATUSES = new Set<ModelProbeStatus>(['failed', 'timeout', 'payment', 'quota', 'rate-limited', 'aborted']);

function availabilityRank(status: ModelProbeStatus): number {
  if (UNHEALTHY_STATUSES.has(status)) return 2;
  if (status === 'deferred') return 1;
  return 0;
}

function compareOptionalNumber(a: number | undefined, b: number | undefined): number {
  const aFinite = typeof a === 'number' && Number.isFinite(a);
  const bFinite = typeof b === 'number' && Number.isFinite(b);
  if (aFinite && bFinite) return a - b;
  if (aFinite) return -1;
  if (bFinite) return 1;
  return 0;
}

function compareModelRows(a: ModelDisplayRow, b: ModelDisplayRow, options: { selectedFirst?: boolean } = {}): number {
  if (options.selectedFirst && a.selected !== b.selected) return a.selected ? -1 : 1;
  return availabilityRank(a.status) - availabilityRank(b.status)
    || RECOMMENDATION_ORDER[a.recommendation] - RECOMMENDATION_ORDER[b.recommendation]
    || compareOptionalNumber(a.latencyMs, b.latencyMs)
    || compareOptionalNumber(a.model.popularityRank, b.model.popularityRank)
    || compareOptionalNumber(a.catalogIndex, b.catalogIndex)
    || (a.model.source ?? 'openrouter').localeCompare(b.model.source ?? 'openrouter')
    || a.model.provider.localeCompare(b.model.provider)
    || a.model.name.localeCompare(b.model.name)
    || a.model.id.localeCompare(b.model.id);
}

export function sortModelRows(rows: ModelDisplayRow[], options: { selectedFirst?: boolean } = {}): ModelDisplayRow[] {
  return [...rows].sort((a, b) => compareModelRows(a, b, options));
}

function isRecentFailedObservation(observation: LatencyObservation | undefined, now: number, ttlMs: number): boolean {
  if (observation?.lastStatus !== 'failed') return false;
  const updatedAt = Date.parse(observation.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt < ttlMs;
}

export function filterListableModelRows(
  rows: ModelDisplayRow[],
  latency: Record<string, LatencyObservation> = {},
  options: { now?: () => number; failedHideTtlMs?: number } = {},
): ModelDisplayRow[] {
  const now = options.now?.() ?? Date.now();
  const failedHideTtlMs = options.failedHideTtlMs ?? FAILED_MODEL_HIDE_TTL_MS;
  return rows.filter((row) => !isRecentFailedObservation(latency[row.model.id], now, failedHideTtlMs));
}

function pad(value: string, width: number): string {
  value = stripControls(value);
  const plain = stripAnsi(value);
  const padding = Math.max(0, width - plain.length);
  return `${value}${' '.repeat(padding)}`;
}

function padTrustedAnsi(value: string, width: number): string {
  const padding = Math.max(0, width - stripAnsi(value).length);
  return `${value}${' '.repeat(padding)}`;
}

function truncate(value: string, width: number): string {
  const plain = stripControls(value);
  if (plain.length <= width) return value;
  if (width <= 1) return '…';
  return `${plain.slice(0, width - 1)}…`;
}

function truncateAnsi(value: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return '';
  if (stripAnsi(value).length <= width) return value;

  let output = '';
  let visible = 0;
  for (let index = 0; index < value.length && visible < width;) {
    const escape = value.slice(index).match(ANSI_AT_START_PATTERN);
    if (escape) {
      output += escape[0];
      index += escape[0].length;
      continue;
    }
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    output += char;
    visible += 1;
    index += char.length;
  }
  return stripAnsi(output) === output ? output : `${output}${RESET}`;
}

function maybeConstrainLine(value: string, maxWidth?: number): string {
  if (typeof maxWidth !== 'number' || !Number.isFinite(maxWidth) || maxWidth <= 0) return value;
  return truncateAnsi(value, Math.floor(maxWidth));
}

function selectionMarker(selected: boolean, interactive: boolean): string {
  if (interactive) return selected ? '●' : '○';
  return selected ? '[x]' : '[ ]';
}

function statusLabel(status: ModelProbeStatus): string {
  if (status === 'rate-limited') return 'rate-limit';
  return status;
}

function sourceLabel(model: OmfmModel): string {
  return (model.source ?? 'openrouter') === 'nvidia' ? 'NVIDIA' : 'OpenRouter';
}

export function renderStaticModelTable(rows: ModelDisplayRow[], options: ModelTableRenderOptions = {}): string {
  const interactive = Boolean(options.interactive);
  const measureRows = options.measureRows ?? rows;
  const sourceWidth = Math.max(6, ...measureRows.map((row) => sourceLabel(row.model).length));
  const providerWidth = Math.max(8, ...measureRows.map((row) => row.model.provider.length));
  const modelWidth = Math.min(48, Math.max(10, ...measureRows.map((row) => Math.max(row.model.name.length, row.model.id.length))));
  const header = interactive
    ? `${pad('Cur', 3)} ${pad('Sel', 3)} ${pad('Source', sourceWidth)} ${pad('Provider', providerWidth)} ${pad('Model', modelWidth)} ${pad('Ctx', 6)} ${pad('Lat', 7)} ${pad('Recommend', 9)} Status`
    : `${pad('Sel', 3)} ${pad('Source', sourceWidth)} ${pad('Provider', providerWidth)} ${pad('Model', modelWidth)} ${pad('Ctx', 6)} ${pad('Lat', 7)} ${pad('Recommend', 9)} Status`;
  const lines = [maybeConstrainLine(header, options.maxWidth)];
  for (const [index, row] of rows.entries()) {
    const active = options.activeIndex === index;
    const cursor = interactive ? (active ? '▶' : ' ') : '';
    const marker = selectionMarker(row.selected, interactive);
    const source = sourceLabel(row.model);
    const provider = stripControls(row.model.provider);
    const modelLabel = stripControls(row.model.name === row.model.id ? row.model.id : `${row.model.name} (${row.model.id})`);
    const fields = [
      pad(marker, 3),
      pad(source, sourceWidth),
      pad(provider, providerWidth),
      pad(truncate(modelLabel, modelWidth), modelWidth),
      pad(formatContextLength(row.model.contextLength), 6),
      padTrustedAnsi(formatLatency(row.latencyMs, { color: options.colorLatency }), 7),
      padTrustedAnsi(formatRecommendation(row.recommendation, { color: options.colorRecommendation }), 9),
      statusLabel(row.status),
    ];
    const line = maybeConstrainLine(interactive ? [pad(cursor, 3), ...fields].join(' ') : fields.join(' '), options.maxWidth);
    const styled = interactive && row.selected ? `${SELECTED_BG}${line}${RESET}` : line;
    lines.push(interactive && active ? `${INVERSE}${styled}${RESET}` : styled);
  }
  const minBodyRows = Math.max(0, Math.floor(options.minBodyRows ?? 0));
  const emptyBodyLine = maybeConstrainLine(
    interactive
      ? `${pad('', 3)} ${pad('', 3)} ${pad('', sourceWidth)} ${pad('', providerWidth)} ${pad('', modelWidth)} ${pad('', 6)} ${pad('', 7)} ${pad('', 9)}`
      : `${pad('', 3)} ${pad('', sourceWidth)} ${pad('', providerWidth)} ${pad('', modelWidth)} ${pad('', 6)} ${pad('', 7)} ${pad('', 9)}`,
    options.maxWidth,
  );
  while (lines.length - 1 < minBodyRows) lines.push(emptyBodyLine);
  return `${lines.join('\n')}\n`;
}
