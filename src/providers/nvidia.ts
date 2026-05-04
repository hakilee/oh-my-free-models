import { FetchLike, OmfmModel } from '../types.js';
import { extractContextLengthFromRecord } from './context-length.js';
import { loadModelMetadataCatalog, modelMetadata, ProviderMetadataCatalog } from './metadata.js';

export const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

export interface NvidiaModel {
  [key: string]: unknown;
  id?: string;
  name?: string;
  context_length?: number;
  max_context_length?: number;
  owned_by?: string;
  object?: string;
  type?: string;
  task?: string;
  tags?: string[];
}

const NON_CHAT_PATTERN = /(?:^|[/_-])bge|embed|embedding|rerank|rank|reward|ocr|video|audio|speech|voice|speaker|detector|detection|translate|translation|guard|safety|retriever/i;

function titleFromId(id: string): string {
  return id
    .split('/')
    .pop()!
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isChatLikeNvidiaModel(model: NvidiaModel): boolean {
  const haystack = `${model.id ?? ''} ${model.name ?? ''} ${model.type ?? ''} ${model.task ?? ''} ${(model.tags ?? []).join(' ')}`;
  if (!model.id || NON_CHAT_PATTERN.test(haystack)) return false;
  if (model.task && !/chat|generate|completion|instruct/i.test(model.task)) return false;
  return true;
}

export function normalizeNvidiaModel(model: NvidiaModel, metadataCatalog?: ProviderMetadataCatalog): OmfmModel {
  const upstreamId = model.id ?? 'unknown';
  const metadata = modelMetadata('nvidia', upstreamId, metadataCatalog);
  return {
    id: `nvidia/${upstreamId}`,
    upstreamId,
    name: model.name ?? metadata?.name ?? titleFromId(upstreamId),
    provider: 'nvidia',
    source: 'nvidia',
    contextLength: extractContextLengthFromRecord(model as Record<string, unknown>) ?? metadata?.contextLength,
    raw: model,
  };
}

export async function listNvidiaFreeModels(options: { apiKey: string; fetchImpl?: FetchLike }): Promise<OmfmModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadataCatalogPromise = loadModelMetadataCatalog({ fetchImpl: options.fetchImpl });
  const response = await fetchImpl('https://integrate.api.nvidia.com/v1/models', {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'User-Agent': 'oh-my-free-models/0.0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`NVIDIA models request failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { data?: NvidiaModel[] } | NvidiaModel[];
  const data = Array.isArray(body) ? body : body.data ?? [];
  const metadataCatalog = await metadataCatalogPromise;
  const models = data
    .filter(isChatLikeNvidiaModel)
    .map((model) => normalizeNvidiaModel(model, metadataCatalog))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return models;
}

export async function postNvidiaChatCompletion(options: {
  apiKey: string;
  body: unknown;
  fetchImpl?: FetchLike;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return fetchImpl(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.body),
  });
}
