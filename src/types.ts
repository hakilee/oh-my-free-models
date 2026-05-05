export type ModelSource = 'openrouter' | 'nvidia';

export type ModelGroupName = 'fast' | 'balanced' | 'capable';

export type ModelGroups = Record<ModelGroupName, string[]>;

export interface OmfmModel {
  id: string;
  upstreamId?: string;
  name: string;
  provider: string;
  source?: ModelSource;
  contextLength?: number;
  popularityRank?: number;
  supportedParameters?: string[];
  raw?: unknown;
}

export interface LatencyObservation {
  modelId: string;
  latencyMs: number;
  updatedAt: string;
  successes: number;
  failures: number;
  lastStatus?: string;
  lastHttpStatus?: number;
  lastError?: string;
  cooldownUntil?: string;
}

export interface UsageObservation {
  modelId: string;
  requests: number;
  successes: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: string;
  lastStatus?: string;
  lastHttpStatus?: number;
}

export interface OmfmConfig {
  port: number;
  selectedModelIds: string[];
  modelGroups: ModelGroups;
}

export interface ModelCache {
  models: OmfmModel[];
  fetchedAt: string;
}

export interface DaemonState {
  pid: number;
  port: number;
  logPath: string;
  startedAt: string;
}

export type FetchLike = typeof fetch;

export type ProviderApiKeys = Partial<Record<ModelSource, string>>;
