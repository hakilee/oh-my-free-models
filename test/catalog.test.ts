import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config/store.js';
import { loadModelCatalog, listAvailableFreeModels } from '../src/providers/catalog.js';
import { MODEL_METADATA_RAW_URL } from '../src/providers/metadata.js';
import { FetchLike, OmfmModel } from '../src/types.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function tempStore(): ConfigStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-catalog-'));
  roots.push(root);
  return new ConfigStore(root);
}

describe('provider catalog aggregation', () => {
  it('deduplicates provider results by local model id', async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url === MODEL_METADATA_RAW_URL) return Response.json({ models: [] });
      return Response.json({
        data: [
          { id: 'deepseek-ai/deepseek-v4-pro', name: 'deepseek-v4-pro', context_length: 1_000_000 },
          { id: 'deepseek-ai/deepseek-v4-pro', name: 'deepseek-v4-pro', context_length: 1_000_000 },
        ],
      });
    };

    const catalog = await listAvailableFreeModels({ apiKeys: { nvidia: 'nvapi-key' }, fetchImpl });

    expect(catalog.models.map((model) => model.id)).toEqual(['nvidia/deepseek-ai/deepseek-v4-pro']);
  });

  it('deduplicates fresh cached models before model picker use', async () => {
    const store = tempStore();
    const duplicate: OmfmModel = { id: 'nvidia/deepseek-ai/deepseek-v4-pro', upstreamId: 'deepseek-ai/deepseek-v4-pro', name: 'deepseek-v4-pro', provider: 'nvidia', source: 'nvidia' };
    store.writeModelCache({ models: [duplicate, duplicate], fetchedAt: new Date().toISOString() });

    const catalog = await loadModelCatalog({ apiKeys: { nvidia: 'nvapi-key' }, store });

    expect(catalog.models.map((model) => model.id)).toEqual(['nvidia/deepseek-ai/deepseek-v4-pro']);
  });
});
