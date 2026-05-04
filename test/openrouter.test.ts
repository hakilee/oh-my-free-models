import { describe, expect, it } from 'vitest';
import { inferProvider, isFreeOpenRouterModel, listOpenRouterFreeModels, normalizeOpenRouterModel } from '../src/providers/openrouter.js';

describe('OpenRouter model filtering', () => {
  it('includes :free text models', () => {
    expect(isFreeOpenRouterModel({ id: 'meta/foo:free', architecture: { output_modalities: ['text'] } })).toBe(true);
  });

  it('includes zero priced text models', () => {
    expect(isFreeOpenRouterModel({ id: 'meta/foo', pricing: { prompt: '0', completion: 0 }, architecture: { output_modalities: ['text'] } })).toBe(true);
  });

  it('excludes image only and paid models', () => {
    expect(isFreeOpenRouterModel({ id: 'img/foo:free', architecture: { output_modalities: ['image'] } })).toBe(false);
    expect(isFreeOpenRouterModel({ id: 'paid/foo', pricing: { prompt: '0.1', completion: '0' } })).toBe(false);
  });

  it('normalizes provider display label', () => {
    const model = normalizeOpenRouterModel({ id: 'google/gemini:free', name: 'Gemini Free' });
    expect(model.provider).toBe('google');
    expect(inferProvider('openai/gpt')).toBe('openai');
  });

  it('falls back to checked-in metadata for context length', () => {
    const model = normalizeOpenRouterModel({ id: 'google/gemma-4-31b-it:free', name: 'Gemma' });
    expect(model.contextLength).toBe(262144);
  });

  it('orders free models by OpenRouter programming popularity rank when available', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('category=programming')) {
        return Response.json({
          data: [
            { id: 'zeta/popular:free', name: 'Popular', architecture: { output_modalities: ['text'] } },
            { id: 'alpha/also-popular:free', name: 'Also Popular', architecture: { output_modalities: ['text'] } },
          ],
        });
      }
      return Response.json({
        data: [
          { id: 'alpha/fallback:free', name: 'Fallback', architecture: { output_modalities: ['text'] } },
          { id: 'alpha/also-popular:free', name: 'Also Popular', architecture: { output_modalities: ['text'] } },
          { id: 'zeta/popular:free', name: 'Popular', architecture: { output_modalities: ['text'] } },
        ],
      });
    }) as typeof fetch;

    const models = await listOpenRouterFreeModels({ apiKey: 'key', fetchImpl });

    expect(models.map((model) => model.id)).toEqual([
      'zeta/popular:free',
      'alpha/also-popular:free',
      'alpha/fallback:free',
    ]);
    expect(models.map((model) => model.popularityRank)).toEqual([0, 1, 2]);
  });
});
