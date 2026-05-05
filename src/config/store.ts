import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL_GROUPS, normalizeModelGroups } from '../model-groups.js';
import { DaemonState, LatencyObservation, ModelCache, ModelGroupName, OmfmConfig, UsageObservation } from '../types.js';
import { getConfigPath, getConfigRoot, getDaemonPath, getLatencyPath, getModelCachePath, getUsagePath } from './paths.js';

const DEFAULT_PORT = 4567;
export const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
export const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

export interface StorePaths {
  root: string;
  configPath: string;
  latencyPath: string;
  usagePath: string;
  modelCachePath: string;
  daemonPath: string;
}

export function createStorePaths(root = getConfigRoot()): StorePaths {
  return {
    root,
    configPath: getConfigPath(root),
    latencyPath: getLatencyPath(root),
    usagePath: getUsagePath(root),
    modelCachePath: getModelCachePath(root),
    daemonPath: getDaemonPath(root),
  };
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

export function isModelCacheFresh(cache: ModelCache): boolean {
  return Date.now() - Date.parse(cache.fetchedAt) < MODEL_CACHE_TTL_MS;
}

export class ConfigStore {
  readonly paths: StorePaths;

  constructor(root = getConfigRoot()) {
    this.paths = createStorePaths(root);
  }

  ensureRoot(): void {
    fs.mkdirSync(this.paths.root, { recursive: true });
  }

  readConfig(): OmfmConfig {
    const config = readJson<Partial<OmfmConfig>>(this.paths.configPath, {});
    return {
      port: typeof config.port === 'number' ? config.port : DEFAULT_PORT,
      selectedModelIds: Array.isArray(config.selectedModelIds) ? config.selectedModelIds.filter((x): x is string => typeof x === 'string') : [],
      modelGroups: normalizeModelGroups(config.modelGroups ?? DEFAULT_MODEL_GROUPS),
    };
  }

  writeConfig(config: OmfmConfig): void {
    writeJson(this.paths.configPath, config);
  }

  updateSelectedModelIds(selectedModelIds: string[]): OmfmConfig {
    const config = this.readConfig();
    const next = { ...config, selectedModelIds: [...new Set(selectedModelIds)] };
    this.writeConfig(next);
    return next;
  }

  updateModelGroup(group: ModelGroupName, modelIds: string[]): OmfmConfig {
    const config = this.readConfig();
    const groupIds = [...new Set(modelIds)];
    const next = {
      ...config,
      selectedModelIds: [...new Set([...config.selectedModelIds, ...groupIds])],
      modelGroups: { ...config.modelGroups, [group]: groupIds },
    };
    this.writeConfig(next);
    return next;
  }

  readLatency(): Record<string, LatencyObservation> {
    return readJson<Record<string, LatencyObservation>>(this.paths.latencyPath, {});
  }

  writeLatency(latency: Record<string, LatencyObservation>): void {
    writeJson(this.paths.latencyPath, latency);
  }

  recordSuccess(modelId: string, latencyMs: number, details: { httpStatus?: number } = {}): void {
    const all = this.readLatency();
    const current = all[modelId];
    all[modelId] = {
      modelId,
      latencyMs,
      updatedAt: new Date().toISOString(),
      successes: (current?.successes ?? 0) + 1,
      failures: current?.failures ?? 0,
      lastStatus: 'ok',
      ...(details.httpStatus !== undefined ? { lastHttpStatus: details.httpStatus } : {}),
    };
    this.writeLatency(all);
  }

  recordFailure(modelId: string, details: { status?: string; httpStatus?: number; error?: string } = {}): void {
    const all = this.readLatency();
    const current = all[modelId];
    const isCooldownTrigger = details.status === 'rate-limited' || details.status === 'quota' || details.httpStatus === 429 || details.httpStatus === 402;
    const cooldown = isCooldownTrigger ? new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS).toISOString() : current?.cooldownUntil;
    all[modelId] = {
      modelId,
      latencyMs: current?.latencyMs ?? Number.POSITIVE_INFINITY,
      updatedAt: new Date().toISOString(),
      successes: current?.successes ?? 0,
      failures: (current?.failures ?? 0) + 1,
      ...(details.status ? { lastStatus: details.status } : {}),
      ...(details.httpStatus !== undefined ? { lastHttpStatus: details.httpStatus } : {}),
      ...(details.error ? { lastError: details.error } : {}),
      ...(cooldown ? { cooldownUntil: cooldown } : {}),
    };
    this.writeLatency(all);
  }

  readUsage(): Record<string, UsageObservation> {
    return readJson<Record<string, UsageObservation>>(this.paths.usagePath, {});
  }

  writeUsage(usage: Record<string, UsageObservation>): void {
    writeJson(this.paths.usagePath, usage);
  }

  recordUsage(modelId: string, details: { success: boolean; inputTokens?: number; outputTokens?: number; totalTokens?: number; httpStatus?: number; status?: string }): void {
    const all = this.readUsage();
    const current = all[modelId];
    const inputTokens = Math.max(0, Math.floor(details.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(details.outputTokens ?? 0));
    const totalTokens = Math.max(0, Math.floor(details.totalTokens ?? inputTokens + outputTokens));
    all[modelId] = {
      modelId,
      requests: (current?.requests ?? 0) + 1,
      successes: (current?.successes ?? 0) + (details.success ? 1 : 0),
      failures: (current?.failures ?? 0) + (details.success ? 0 : 1),
      inputTokens: (current?.inputTokens ?? 0) + inputTokens,
      outputTokens: (current?.outputTokens ?? 0) + outputTokens,
      totalTokens: (current?.totalTokens ?? 0) + totalTokens,
      updatedAt: new Date().toISOString(),
      lastStatus: details.status ?? (details.success ? 'ok' : 'failed'),
      ...(details.httpStatus !== undefined ? { lastHttpStatus: details.httpStatus } : {}),
    };
    this.writeUsage(all);
  }

  readModelCache(): ModelCache | undefined {
    return readJson<ModelCache | undefined>(this.paths.modelCachePath, undefined);
  }

  writeModelCache(cache: ModelCache): void {
    writeJson(this.paths.modelCachePath, cache);
  }

  readDaemon(): DaemonState | undefined {
    return readJson<DaemonState | undefined>(this.paths.daemonPath, undefined);
  }

  writeDaemon(state: DaemonState): void {
    writeJson(this.paths.daemonPath, state);
  }

  clearDaemon(): void {
    if (fs.existsSync(this.paths.daemonPath)) fs.unlinkSync(this.paths.daemonPath);
  }
}

export { DEFAULT_PORT };
