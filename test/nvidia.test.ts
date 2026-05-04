import { describe, expect, it } from 'vitest';
import { parseContextLengthFromText } from '../src/providers/context-length.js';
import { MODEL_METADATA_RAW_URL } from '../src/providers/metadata.js';
import { listNvidiaFreeModels, normalizeNvidiaModel } from '../src/providers/nvidia.js';

describe('NVIDIA model provider', () => {
  it('normalizes NVIDIA route IDs while preserving upstream IDs', () => {
    const model = normalizeNvidiaModel({ id: 'deepseek-ai/deepseek-v3.2', context_length: 128000 });
    expect(model).toMatchObject({
      id: 'nvidia/deepseek-ai/deepseek-v3.2',
      upstreamId: 'deepseek-ai/deepseek-v3.2',
      provider: 'nvidia',
      source: 'nvidia',
    });
  });

  it('normalizes NVIDIA context length aliases', () => {
    expect(normalizeNvidiaModel({ id: 'nvidia/nemotron-3-super-120b-a12b', max_model_len: 1_000_000 }).contextLength).toBe(1_000_000);
    expect(normalizeNvidiaModel({ id: 'nvidia/llama', metadata: { context_window: '128K tokens' } }).contextLength).toBe(128_000);
  });

  it('falls back to checked-in metadata for context length', () => {
    expect(normalizeNvidiaModel({ id: 'z-ai/glm-5.1' }).contextLength).toBe(131_072);
  });

  it('parses context length from NVIDIA model card text', () => {
    expect(parseContextLengthFromText('| **Context Length** | Up to 1M tokens |')).toBe(1_000_000);
    expect(parseContextLengthFromText('Other Properties Related to Input: Context length up to 131,072 tokens')).toBe(131_072);
    expect(parseContextLengthFromText('Open model with 128K context for coding.')).toBe(128_000);
    expect(parseContextLengthFromText('Visual token budgets are 70, 140, 280, 560, and 1120. Input Context Length (ISL): 256K')).toBe(256_000);
    expect(parseContextLengthFromText('The page mentions 4 modes and 140 languages without a context length.')).toBeUndefined();
  });

  it('lists chat-like NVIDIA models and filters non-chat models', async () => {
    const fetchImpl = (async () => Response.json({
      data: [
        { id: 'deepseek-ai/deepseek-v3.2', context_length: 128000 },
        { id: 'baai/bge-m3' },
        { id: 'nvidia/embed-qa', task: 'embedding' },
        { id: 'nvidia/reranker', task: 'rerank' },
      ],
    })) as typeof fetch;
    const models = await listNvidiaFreeModels({ apiKey: 'nvapi-key', fetchImpl });
    expect(models.map((model) => model.id)).toEqual(['nvidia/deepseek-ai/deepseek-v3.2']);
  });

  it('uses raw metadata without fetching Build NVIDIA while listing models', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url === MODEL_METADATA_RAW_URL) {
        return Response.json({
          models: [
            { source: 'nvidia', id: 'example/test-chat', contextLength: 64_000 },
          ],
        });
      }
      return Response.json({ data: [{ id: 'example/test-chat' }] });
    }) as typeof fetch;

    const models = await listNvidiaFreeModels({ apiKey: 'nvapi-key', fetchImpl });

    expect(models).toMatchObject([{ id: 'nvidia/example/test-chat', contextLength: 64_000 }]);
    expect(urls).toContain(MODEL_METADATA_RAW_URL);
    expect(urls).toContain('https://integrate.api.nvidia.com/v1/models');
    expect(urls.some((url) => url.includes('build.nvidia.com'))).toBe(false);
  });
});
