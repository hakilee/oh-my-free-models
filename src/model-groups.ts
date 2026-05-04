import { ModelGroupName, ModelGroups } from './types.js';

export const MODEL_GROUP_NAMES: ModelGroupName[] = ['fast', 'balanced', 'capable'];

export const DEFAULT_MODEL_GROUPS: ModelGroups = {
  fast: [],
  balanced: [],
  capable: [],
};

const MODEL_GROUP_ALIASES: Record<string, ModelGroupName> = {
  fast: 'fast',
  haiku: 'fast',
  balanced: 'balanced',
  sonnet: 'balanced',
  capable: 'capable',
  opus: 'capable',
};

export function normalizeModelGroupName(value: string | undefined): ModelGroupName | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/^omfm\//, '');
  return MODEL_GROUP_ALIASES[normalized];
}

export function normalizeModelGroups(value: unknown): ModelGroups {
  const source = value && typeof value === 'object' ? value as Partial<Record<ModelGroupName, unknown>> : {};
  return {
    fast: Array.isArray(source.fast) ? source.fast.filter((x): x is string => typeof x === 'string') : [],
    balanced: Array.isArray(source.balanced) ? source.balanced.filter((x): x is string => typeof x === 'string') : [],
    capable: Array.isArray(source.capable) ? source.capable.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function selectedGroupModelIds(selectedModelIds: string[], modelGroups: ModelGroups, requestedModel?: string): string[] | undefined {
  const group = normalizeModelGroupName(requestedModel);
  if (!group) return undefined;
  const selected = new Set(selectedModelIds);
  const ids = [...new Set(modelGroups[group])].filter((id) => selected.has(id));
  return ids.length > 0 ? ids : undefined;
}
