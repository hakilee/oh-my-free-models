import { FetchLike, OmfmModel } from '../types.js';
import { loadModelMetadataCatalog, modelMetadata, ProviderMetadataCatalog } from './metadata.js';

export interface OpenRouterModel {
  id?: string;
  name?: string;
  canonical_slug?: string;
  created?: number;
  context_length?: number;
  pricing?: Record<string, string | number | null | undefined>;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  supported_parameters?: string[];
}

function priceIsZero(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n === 0;
}

function isTextOutput(model: OpenRouterModel): boolean {
  const outputs = model.architecture?.output_modalities;
  if (!outputs || outputs.length === 0) return true;
  return outputs.includes('text');
}

export function inferProvider(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/')[0] || 'openrouter' : 'openrouter';
}

export function isFreeOpenRouterModel(model: OpenRouterModel): boolean {
  if (!model.id || !isTextOutput(model)) return false;
  if (model.id.endsWith(':free')) return true;
  const pricing = model.pricing ?? {};
  return priceIsZero(pricing.prompt) && priceIsZero(pricing.completion) && priceIsZero(pricing.request ?? 0);
}

export function normalizeOpenRouterModel(model: OpenRouterModel, popularityRank?: number, metadataCatalog?: ProviderMetadataCatalog): OmfmModel {
  const id = model.id ?? model.canonical_slug ?? 'unknown';
  const metadata = modelMetadata('openrouter', id, metadataCatalog);
  return {
    id,
    upstreamId: id,
    name: model.name ?? id,
    provider: inferProvider(id),
    source: 'openrouter',
    contextLength: model.context_length ?? metadata?.contextLength,
    popularityRank,
    supportedParameters: model.supported_parameters ?? [],
    raw: model,
  };
}

async function fetchOpenRouterModels(options: { apiKey: string; fetchImpl: FetchLike; category?: string }): Promise<OpenRouterModel[]> {
  const url = new URL('https://openrouter.ai/api/v1/models');
  if (options.category) url.searchParams.set('category', options.category);
  const response = await options.fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'User-Agent': 'oh-my-free-models/0.0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { data?: OpenRouterModel[] };
  return body.data ?? [];
}

export async function listOpenRouterFreeModels(options: { apiKey: string; fetchImpl?: FetchLike }): Promise<OmfmModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadataCatalogPromise = loadModelMetadataCatalog({ fetchImpl: options.fetchImpl });
  const allModels = await fetchOpenRouterModels({ apiKey: options.apiKey, fetchImpl });
  const programmingPopularity = await fetchOpenRouterModels({ apiKey: options.apiKey, fetchImpl, category: 'programming' }).catch(() => []);
  const metadataCatalog = await metadataCatalogPromise;
  const popularityById = new Map<string, number>();
  for (const [index, model] of programmingPopularity.entries()) {
    if (model.id) popularityById.set(model.id, index);
  }
  return allModels
    .filter(isFreeOpenRouterModel)
    .map((model, index) => normalizeOpenRouterModel(model, popularityById.get(model.id ?? '') ?? programmingPopularity.length + index, metadataCatalog))
    .sort((a, b) => (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function postOpenRouterChatCompletion(options: {
  apiKey: string;
  body: unknown;
  stream?: boolean;
  fetchImpl?: FetchLike;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/hakilee/oh-my-free-models',
      'X-OpenRouter-Title': 'oh-my-free-models',
    },
    body: JSON.stringify(options.body),
  });
}

export async function postOpenRouterAnthropicMessage(options: {
  apiKey: string;
  body: unknown;
  headers?: Headers;
  fetchImpl?: FetchLike;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const anthropicVersion = options.headers?.get('anthropic-version') ?? '2023-06-01';
  return fetchImpl('https://openrouter.ai/api/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': anthropicVersion,
      'HTTP-Referer': 'https://github.com/hakilee/oh-my-free-models',
      'X-OpenRouter-Title': 'oh-my-free-models',
    },
    body: JSON.stringify(options.body),
  });
}
