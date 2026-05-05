import { ConfigStore } from '../config/store.js';
import { UsageObservation } from '../types.js';

interface OutputLike {
  write(chunk: string): unknown;
}

export interface RunUsageCommandOptions {
  json?: boolean;
  store?: ConfigStore;
  stdout?: OutputLike;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`;
}

function formatTable(rows: UsageObservation[]): string {
  if (rows.length === 0) return 'No usage recorded yet.\n';
  const modelWidth = Math.min(56, Math.max(5, ...rows.map((row) => row.modelId.length)));
  const lines = [
    `${pad('Model', modelWidth)} ${pad('Req', 5)} ${pad('OK', 5)} ${pad('Fail', 5)} ${pad('InTok', 8)} ${pad('OutTok', 8)} ${pad('Total', 8)} Last`,
    `${'-'.repeat(modelWidth)} ${'-'.repeat(5)} ${'-'.repeat(5)} ${'-'.repeat(5)} ${'-'.repeat(8)} ${'-'.repeat(8)} ${'-'.repeat(8)} ----`,
  ];
  for (const row of rows) {
    lines.push([
      pad(row.modelId.length > modelWidth ? `${row.modelId.slice(0, modelWidth - 1)}…` : row.modelId, modelWidth),
      pad(String(row.requests), 5),
      pad(String(row.successes), 5),
      pad(String(row.failures), 5),
      pad(String(row.inputTokens), 8),
      pad(String(row.outputTokens), 8),
      pad(String(row.totalTokens), 8),
      row.updatedAt,
    ].join(' '));
  }
  return `${lines.join('\n')}\n`;
}

export function usageRows(store = new ConfigStore()): UsageObservation[] {
  return Object.values(store.readUsage()).sort((a, b) =>
    b.requests - a.requests
    || b.totalTokens - a.totalTokens
    || a.modelId.localeCompare(b.modelId),
  );
}

export function runUsageCommand(options: RunUsageCommandOptions = {}): void {
  const store = options.store ?? new ConfigStore();
  const stdout = options.stdout ?? process.stdout;
  const rows = usageRows(store);
  if (options.json) {
    stdout.write(`${JSON.stringify({ usage: rows }, null, 2)}\n`);
    return;
  }
  stdout.write(formatTable(rows));
}
