import { Writable, Readable } from 'node:stream';
import { ConfigStore } from '../config/store.js';
import { probeProviderModel } from '../latency/probe.js';
import { ProbeTerminalState, runProbeScheduler } from '../latency/probe-scheduler.js';
import { FetchLike, OmfmModel, ProviderApiKeys } from '../types.js';
import { buildModelRows, ModelDisplayRow, recommendModel, renderStaticModelTable, sortModelRows } from './model-view.js';

export interface ModelTuiResult {
  selectedModelIds: string[];
  saved: boolean;
  interrupted: boolean;
  terminalState: ProbeTerminalState | 'idle';
}

interface RawModelTuiOptions {
  rows: ModelDisplayRow[];
  stdin?: NodeJS.ReadStream | Readable;
  stdout?: NodeJS.WriteStream | Writable;
  save: (selectedModelIds: string[]) => void;
  startProbes: (handlers: { onRow: (row: Partial<ModelDisplayRow> & { modelId: string }) => void; signal: AbortSignal }) => Promise<ProbeTerminalState>;
  isTTY?: boolean;
}

export interface ModelTuiOptions {
  models: OmfmModel[];
  selectedModelIds: string[];
  store: ConfigStore;
  apiKey: string;
  apiKeys?: ProviderApiKeys;
  stdin?: NodeJS.ReadStream | Readable;
  stdout?: NodeJS.WriteStream | Writable;
  fetchImpl?: FetchLike;
  runScheduler?: typeof runProbeScheduler;
}

const ESC = '\u001b';
const ENABLE_MOUSE = `${ESC}[?1000h${ESC}[?1006h`;
const DISABLE_MOUSE = `${ESC}[?1000l${ESC}[?1006l`;
const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const EXIT_ALT_SCREEN = `${ESC}[?1049l`;

function write(out: NodeJS.WriteStream | Writable, value: string): void {
  out.write(value);
}

function setRawMode(input: NodeJS.ReadStream | Readable, value: boolean): void {
  const maybe = input as NodeJS.ReadStream;
  if (typeof maybe.setRawMode === 'function' && maybe.isTTY) maybe.setRawMode(value);
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function terminalDimension(stream: NodeJS.WriteStream | Writable, envName: 'COLUMNS' | 'LINES', fallback: number): number {
  const maybe = stream as NodeJS.WriteStream & { columns?: number; rows?: number; getWindowSize?: () => [number, number] };
  const direct = envName === 'COLUMNS' ? positiveInt(maybe.columns) : positiveInt(maybe.rows);
  if (direct !== undefined) return direct;
  if (typeof maybe.getWindowSize === 'function') {
    try {
      const [columns, rows] = maybe.getWindowSize();
      const sized = envName === 'COLUMNS' ? positiveInt(columns) : positiveInt(rows);
      if (sized !== undefined) return sized;
    } catch {
      // Window size probing is best-effort; fall through to environment/fallback.
    }
  }
  return positiveInt(process.env[envName]) ?? fallback;
}

function mouseWheelName(value: string): string | undefined {
  const sgr = value.match(/^\u001b\[<(\d+);\d+;\d+[Mm]$/);
  if (sgr) {
    const button = Number(sgr[1]);
    if ((button & 64) === 64) return (button & 1) === 1 ? 'wheel-down' : 'wheel-up';
  }

  if (value.startsWith('\u001b[M') && value.length >= 6) {
    const button = value.charCodeAt(3) - 32;
    if ((button & 64) === 64) return (button & 1) === 1 ? 'wheel-down' : 'wheel-up';
  }
  return undefined;
}

function keyName(chunk: Buffer | string): string {
  const value = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
  const mouseWheel = mouseWheelName(value);
  if (mouseWheel) return mouseWheel;
  if (value === '\u0003') return 'ctrl-c';
  if (value === '\r' || value === '\n') return 'enter';
  if (value === ' ') return 'space';
  if (value === 'j' || value === '\u001b[B') return 'down';
  if (value === 'k' || value === '\u001b[A') return 'up';
  if (value === '\u001b[5~') return 'page-up';
  if (value === '\u001b[6~') return 'page-down';
  if (value === 'g' || value === '\u001b[H' || value === '\u001b[1~') return 'home';
  if (value === 'G' || value === '\u001b[F' || value === '\u001b[4~') return 'end';
  if (value === 'q' || value === '\u001b') return 'quit';
  return value;
}

async function runRawModelTui(options: RawModelTuiOptions): Promise<ModelTuiResult> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const rows = options.rows.map((row) => ({ ...row }));
  const initialSelectedModelIds = rows.filter((row) => row.selected).map((row) => row.model.id);
  const selected = new Set(initialSelectedModelIds);
  const controller = new AbortController();
  let cursor = 0;
  let scrollOffset = 0;
  let done = false;
  let hasRendered = false;
  let saved = false;
  let interrupted = false;
  let terminalState: ProbeTerminalState | 'idle' = 'idle';

  const tableViewportRows = () => {
    const terminalRows = terminalDimension(stdout, 'LINES', 24);
    const fixedRows = terminalState === 'quota-deferred' ? 4 : 3; // title, legend, optional note, table header
    return Math.max(1, terminalRows - fixedRows);
  };

  const constrainCursorAndScroll = () => {
    if (rows.length === 0) {
      cursor = 0;
      scrollOffset = 0;
      return;
    }
    const viewportRows = tableViewportRows();
    cursor = Math.min(rows.length - 1, Math.max(0, cursor));
    if (cursor < scrollOffset) scrollOffset = cursor;
    if (cursor >= scrollOffset + viewportRows) scrollOffset = cursor - viewportRows + 1;
    scrollOffset = Math.min(Math.max(0, rows.length - viewportRows), Math.max(0, scrollOffset));
  };

  const clearLine = (value: string) => `${value}${ESC}[K`;

  const render = () => {
    constrainCursorAndScroll();
    const viewportRows = tableViewportRows();
    const viewRows = rows.map((row) => ({ ...row, selected: selected.has(row.model.id) }));
    const visibleRows = viewRows.slice(scrollOffset, scrollOffset + viewportRows);
    const showingStart = rows.length === 0 ? 0 : scrollOffset + 1;
    const showingEnd = Math.min(rows.length, scrollOffset + viewportRows);
    const maxWidth = Math.max(20, terminalDimension(stdout, 'COLUMNS', 100) - 1);
    const selectedCount = [...selected].length;
    const status = terminalState === 'idle' ? 'probing…' : terminalState;
    const lines = [
      clearLine(`omfm model  •  ${selectedCount} selected  •  Rows ${showingStart}-${showingEnd}/${rows.length}  •  ${status}`),
      clearLine('▶ current   ● selected   ○ unselected   ↑↓/jk move   PgUp/PgDn scroll   Space toggle   Enter save   q cancel'),
      ...(terminalState === 'quota-deferred' ? [clearLine('Probe note: quota/payment limit reached; remaining rows deferred.')] : []),
      renderStaticModelTable(visibleRows, { activeIndex: cursor - scrollOffset, colorLatency: true, colorRecommendation: true, interactive: true, maxWidth, measureRows: viewRows, minBodyRows: viewportRows })
        .split('\n')
        .filter((row) => row.length > 0)
        .map(clearLine),
    ].flat();
    const frame = [
      hasRendered ? `${ESC}[H` : `${ENTER_ALT_SCREEN}${ESC}[?25l${ENABLE_MOUSE}${ESC}[H`,
      lines.join('\n'),
      `${ESC}[J`,
    ].join('');
    write(stdout, frame);
    hasRendered = true;
  };

  const cleanup = () => {
    controller.abort();
    setRawMode(stdin, false);
    stdin.pause?.();
    write(stdout, `${DISABLE_MOUSE}${ESC}[?25h${ESC}[0m${EXIT_ALT_SCREEN}`);
  };

  render();
  setRawMode(stdin, true);
  stdin.resume?.();
  const probePromise = options
    .startProbes({
      signal: controller.signal,
      onRow: (update) => {
        const row = rows.find((candidate) => candidate.model.id === update.modelId);
        if (!row) return;
        if (update.status) row.status = update.status;
        if (typeof update.latencyMs === 'number') row.latencyMs = update.latencyMs;
        row.recommendation = recommendModel(row);
        if (!done) render();
      },
    })
    .then((state) => {
      terminalState = state;
      if (!done) render();
      return state;
    })
    .catch(() => 'aborted' as ProbeTerminalState);

  return new Promise<ModelTuiResult>((resolve) => {
    const finish = (result: Omit<ModelTuiResult, 'terminalState'>) => {
      if (done) return;
      done = true;
      stdin.off?.('data', onData);
      cleanup();
      resolve({ ...result, terminalState });
    };
    const onData = (chunk: Buffer | string) => {
      const key = keyName(chunk);
      if (key === 'ctrl-c') {
        interrupted = true;
        finish({ selectedModelIds: initialSelectedModelIds, saved: false, interrupted });
        return;
      }
      if (key === 'enter') {
        saved = true;
        const selectedModelIds = rows.filter((row) => selected.has(row.model.id)).map((row) => row.model.id);
        options.save(selectedModelIds);
        finish({ selectedModelIds, saved, interrupted: false });
        return;
      }
      if (key === 'quit') {
        finish({ selectedModelIds: initialSelectedModelIds, saved: false, interrupted: false });
        return;
      }
      if (key === 'space') {
        const id = rows[cursor]?.model.id;
        if (id) {
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
        }
      } else if (key === 'down') {
        cursor = Math.min(rows.length - 1, cursor + 1);
      } else if (key === 'up') {
        cursor = Math.max(0, cursor - 1);
      } else if (key === 'wheel-down') {
        scrollOffset = Math.min(Math.max(0, rows.length - tableViewportRows()), scrollOffset + 1);
        cursor = scrollOffset;
      } else if (key === 'wheel-up') {
        scrollOffset = Math.max(0, scrollOffset - 1);
        cursor = scrollOffset;
      } else if (key === 'page-down') {
        const viewportRows = tableViewportRows();
        scrollOffset = Math.min(Math.max(0, rows.length - viewportRows), scrollOffset + viewportRows);
        cursor = scrollOffset;
      } else if (key === 'page-up') {
        scrollOffset = Math.max(0, scrollOffset - tableViewportRows());
        cursor = scrollOffset;
      } else if (key === 'home') {
        cursor = 0;
      } else if (key === 'end') {
        cursor = Math.max(0, rows.length - 1);
      }
      render();
    };
    stdin.on('data', onData);
  });
}

export async function runModelTui(options: ModelTuiOptions): Promise<ModelTuiResult> {
  const selectedIds = new Set(options.selectedModelIds);
  return runRawModelTui({
    rows: sortModelRows(buildModelRows(options.models, selectedIds, options.store.readLatency()), { selectedFirst: true }),
    stdin: options.stdin,
    stdout: options.stdout,
    save: () => undefined,
    startProbes: ({ onRow, signal }) =>
      (options.runScheduler ?? runProbeScheduler)({
        models: options.models,
        store: options.store,
        signal,
        probe: (model, probeSignal) => {
          onRow({ modelId: model.id, status: 'probing' });
          const source = model.source ?? 'openrouter';
          const apiKey = options.apiKeys?.[source] ?? (source === 'openrouter' ? options.apiKey : undefined);
          if (!apiKey) return Promise.resolve({ modelId: model.id, status: 'failed', error: `${source} API key is not configured` });
          return probeProviderModel({ apiKey, model, fetchImpl: options.fetchImpl, signal: probeSignal });
        },
        onUpdate: ({ modelId, result }) => onRow({ modelId, status: result.status === 'payment' ? 'quota' : result.status, latencyMs: result.latencyMs }),
        onDeferred: (modelId) => onRow({ modelId, status: 'deferred' }),
      }),
  });
}
