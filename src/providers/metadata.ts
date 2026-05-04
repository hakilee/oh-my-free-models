import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FetchLike, ModelSource } from '../types.js';
import { parseTokenCount } from './context-length.js';

export const MODEL_METADATA_RAW_URL = 'https://raw.githubusercontent.com/hakilee/oh-my-free-models/model-metadata/data/model-metadata.json';
const MODEL_METADATA_TIMEOUT_MS = 1_200;

export interface ProviderModelMetadata {
  source: ModelSource;
  id: string;
  name?: string;
  contextLength?: number;
  metadataSources?: string[];
  updatedAt?: string;
}

interface ProviderModelMetadataCatalog {
  schemaVersion?: number;
  models?: ProviderModelMetadata[];
}

export type ProviderMetadataCatalog = Map<string, ProviderModelMetadata>;

let cachedLocalCatalog: ProviderMetadataCatalog | undefined;
let cachedRemoteCatalogPromise: Promise<ProviderMetadataCatalog> | undefined;

function catalogPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'model-metadata.json');
}

function metadataKey(source: ModelSource, id: string): string {
  return `${source}:${id.replace(/:free$/, '')}`;
}

function parseCatalog(catalog: ProviderModelMetadataCatalog): ProviderMetadataCatalog {
  const byKey = new Map<string, ProviderModelMetadata>();
  for (const model of catalog.models ?? []) {
    if (!model?.source || !model.id) continue;
    const contextLength = parseTokenCount(model.contextLength);
    byKey.set(metadataKey(model.source, model.id), {
      ...model,
      contextLength,
    });
  }
  return byKey;
}

function readLocalCatalog(): ProviderMetadataCatalog {
  try {
    const catalog = JSON.parse(readFileSync(catalogPath(), 'utf8')) as ProviderModelMetadataCatalog;
    return parseCatalog(catalog);
  } catch {
    // Packaged metadata is an optimization. Provider listing must still work if it is absent.
    return new Map();
  }
}

async function fetchRemoteCatalog(fetchImpl: FetchLike): Promise<ProviderMetadataCatalog | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_METADATA_TIMEOUT_MS);
  try {
    const response = await fetchImpl(MODEL_METADATA_RAW_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'oh-my-free-models/0.0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    return parseCatalog(await response.json() as ProviderModelMetadataCatalog);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function localCatalog(): ProviderMetadataCatalog {
  cachedLocalCatalog ??= readLocalCatalog();
  return cachedLocalCatalog;
}

export async function loadModelMetadataCatalog(options: { fetchImpl?: FetchLike } = {}): Promise<ProviderMetadataCatalog> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!options.fetchImpl) {
    cachedRemoteCatalogPromise ??= fetchRemoteCatalog(fetchImpl).then((catalog) => catalog ?? localCatalog());
    return cachedRemoteCatalogPromise;
  }
  return (await fetchRemoteCatalog(fetchImpl)) ?? localCatalog();
}

export function modelMetadata(source: ModelSource, id: string, catalog: ProviderMetadataCatalog = localCatalog()): ProviderModelMetadata | undefined {
  return catalog.get(metadataKey(source, id));
}
