import { ConfigStore, isModelCacheFresh } from '../config/store.js';
import { FetchLike, ModelSource, OmfmModel, ProviderApiKeys } from '../types.js';
import { listNvidiaFreeModels } from './nvidia.js';
import { listOpenRouterFreeModels } from './openrouter.js';

export interface ProviderCatalogResult {
  models: OmfmModel[];
  errors: string[];
}

export interface LoadedModelCatalog {
  models: OmfmModel[];
  source: 'fresh' | 'fetched' | 'stale';
  errors: string[];
}

function errorMessage(source: string, error: unknown): string {
  return `${source}: ${error instanceof Error ? error.message : String(error)}`;
}

function sourceOf(model: OmfmModel): ModelSource {
  return model.source === 'nvidia' ? 'nvidia' : 'openrouter';
}

function modelsForConfiguredProviders(models: OmfmModel[], apiKeys: ProviderApiKeys): OmfmModel[] {
  return models.filter((model) => Boolean(apiKeys[sourceOf(model)]));
}

function compareByPopularity(a: OmfmModel, b: OmfmModel): number {
  return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER)
    || (a.source ?? 'openrouter').localeCompare(b.source ?? 'openrouter')
    || a.provider.localeCompare(b.provider)
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id);
}

export async function listAvailableFreeModels(options: { apiKeys: ProviderApiKeys; fetchImpl?: FetchLike }): Promise<ProviderCatalogResult> {
  const tasks: Array<Promise<OmfmModel[]>> = [];
  const labels: string[] = [];
  if (options.apiKeys.openrouter) {
    labels.push('OpenRouter');
    tasks.push(listOpenRouterFreeModels({ apiKey: options.apiKeys.openrouter, fetchImpl: options.fetchImpl }));
  }
  if (options.apiKeys.nvidia) {
    labels.push('NVIDIA');
    tasks.push(listNvidiaFreeModels({ apiKey: options.apiKeys.nvidia, fetchImpl: options.fetchImpl }));
  }

  const settled = await Promise.allSettled(tasks);
  const models: OmfmModel[] = [];
  const errors: string[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status === 'fulfilled') models.push(...result.value);
    else errors.push(errorMessage(labels[index] ?? 'provider', result.reason));
  }

  return {
    models: models.sort(compareByPopularity),
    errors,
  };
}

export async function loadModelCatalog(options: { apiKeys: ProviderApiKeys; fetchImpl?: FetchLike; store: ConfigStore }): Promise<LoadedModelCatalog> {
  const cache = options.store.readModelCache();
  const cachedModels = cache ? modelsForConfiguredProviders(cache.models, options.apiKeys) : [];
  if (cache && isModelCacheFresh(cache) && cachedModels.length > 0) return { models: cachedModels, source: 'fresh', errors: [] };

  const result = await listAvailableFreeModels({ apiKeys: options.apiKeys, fetchImpl: options.fetchImpl });
  if (result.models.length > 0) {
    options.store.writeModelCache({ models: result.models, fetchedAt: new Date().toISOString() });
    return { models: result.models, source: 'fetched', errors: result.errors };
  }
  if (cache && cachedModels.length > 0) return { models: cachedModels, source: 'stale', errors: result.errors };
  throw new Error(result.errors.length > 0 ? `All provider model fetches failed: ${result.errors.join('; ')}` : 'No provider models are available.');
}
