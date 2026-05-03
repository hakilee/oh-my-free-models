import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config/store.js';
import { createOmfmServer, listen } from '../src/server/create-server.js';
import { FetchLike, OmfmModel } from '../src/types.js';

const roots: string[] = [];
function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-server-'));
  roots.push(root);
  const store = new ConfigStore(root);
  store.updateSelectedModelIds(['slow:free', 'fast:free']);
  const models: OmfmModel[] = [
    { id: 'slow:free', name: 'Slow', provider: 'test' },
    { id: 'fast:free', name: 'Fast', provider: 'test' },
  ];
  store.writeModelCache({ models, fetchedAt: new Date().toISOString() });
  store.recordSuccess('slow:free', 500);
  store.recordSuccess('fast:free', 10);
  return store;
}

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

async function withServer<T>(store: ConfigStore, fetchImpl: FetchLike, fn: (base: string) => Promise<T>): Promise<T> {
  const server = createOmfmServer({ store, fetchImpl, env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv });
  const port = await listen(server, 0);
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('local proxy server', () => {
  it('returns selected models in OpenAI-compatible shape', async () => {
    const store = tempStore();
    await withServer(store, (async () => new Response('{}')) as FetchLike, async (base) => {
      const res = await fetch(`${base}/v1/models`);
      const body = await res.json() as any;
      expect(body.data.map((m: any) => m.id)).toEqual(['slow:free', 'fast:free']);
    });
  });

  it('refreshes stale model cache before listing selected models', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-stale-model-cache-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['new:free']);
    store.writeModelCache({
      models: [{ id: 'old:free', name: 'Old', provider: 'old' }],
      fetchedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });
    let calls = 0;
    await withServer(store, (async () => {
      calls += 1;
      return Response.json({ data: [{ id: 'new:free', name: 'New', context_length: 8192, architecture: { output_modalities: ['text'] } }] });
    }) as FetchLike, async (base) => {
      const res = await fetch(`${base}/v1/models`);
      const body = await res.json() as any;
      expect(body.data.map((model: any) => model.id)).toEqual(['new:free']);
      expect(calls).toBeGreaterThan(0);
    });
  });

  it('routes OpenAI chat to lowest latency selected model', async () => {
    const store = tempStore();
    const seen: any[] = [];
    const mockFetch: FetchLike = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    };
    await withServer(store, mockFetch, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(body.model).toBe('fast:free');
      expect(seen[0].model).toBe('fast:free');
    });
  });

  it('routes selected NVIDIA models with their upstream model id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-nvidia-server-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/deepseek-ai/deepseek-v3.2']);
    store.writeModelCache({
      models: [{ id: 'nvidia/deepseek-ai/deepseek-v3.2', upstreamId: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek', provider: 'nvidia', source: 'nvidia' }],
      fetchedAt: new Date().toISOString(),
    });
    const seen: any[] = [];
    const server = createOmfmServer({
      store,
      env: { NVIDIA_API_KEY: 'nvapi-key' } as NodeJS.ProcessEnv,
      fetchImpl: (async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      }) as FetchLike,
    });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(body.model).toBe('deepseek-ai/deepseek-v3.2');
      expect(seen[0].url).toContain('integrate.api.nvidia.com');
      expect(seen[0].body.model).toBe('deepseek-ai/deepseek-v3.2');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('honors selected NVIDIA models requested by upstream id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-nvidia-upstream-request-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/deepseek-ai/deepseek-v3.2', 'fast:free']);
    store.writeModelCache({
      models: [
        { id: 'nvidia/deepseek-ai/deepseek-v3.2', upstreamId: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek', provider: 'nvidia', source: 'nvidia' },
        { id: 'fast:free', name: 'Fast', provider: 'test', source: 'openrouter', raw: { id: 'fast:free', pricing: { prompt: '0', completion: '0' } } },
      ],
      fetchedAt: new Date().toISOString(),
    });
    store.recordSuccess('fast:free', 1);
    store.recordSuccess('nvidia/deepseek-ai/deepseek-v3.2', 100);
    const seen: any[] = [];
    const server = createOmfmServer({
      store,
      env: { OPENROUTER_API_KEY: 'key', NVIDIA_API_KEY: 'nvapi-key' } as NodeJS.ProcessEnv,
      fetchImpl: (async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      }) as FetchLike,
    });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek-ai/deepseek-v3.2', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.model).toBe('deepseek-ai/deepseek-v3.2');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('integrate.api.nvidia.com');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('prefers an exact selected local id before an upstream id match', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-exact-before-upstream-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['same', 'nvidia/same']);
    store.writeModelCache({
      models: [
        { id: 'same', upstreamId: 'same', name: 'OpenRouter Same', provider: 'test', source: 'openrouter', raw: { id: 'same', pricing: { prompt: '0', completion: '0', request: '0' } } },
        { id: 'nvidia/same', upstreamId: 'same', name: 'NVIDIA Same', provider: 'nvidia', source: 'nvidia' },
      ],
      fetchedAt: new Date().toISOString(),
    });
    store.recordSuccess('nvidia/same', 1);
    store.recordSuccess('same', 100);
    const seen: any[] = [];
    const server = createOmfmServer({
      store,
      env: { OPENROUTER_API_KEY: 'key', NVIDIA_API_KEY: 'nvapi-key' } as NodeJS.ProcessEnv,
      fetchImpl: (async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      }) as FetchLike,
    });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'same', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.model).toBe('same');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('openrouter.ai');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('honors provider-prefixed selected models requested by derived upstream id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-derived-upstream-request-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/foo', 'fast:free']);
    store.writeModelCache({
      models: [
        { id: 'nvidia/foo', name: 'NVIDIA Foo', provider: 'nvidia', source: 'nvidia' },
        { id: 'fast:free', name: 'Fast', provider: 'test', source: 'openrouter', raw: { id: 'fast:free', pricing: { prompt: '0', completion: '0' } } },
      ],
      fetchedAt: new Date().toISOString(),
    });
    store.recordSuccess('fast:free', 1);
    store.recordSuccess('nvidia/foo', 100);
    const seen: any[] = [];
    const server = createOmfmServer({
      store,
      env: { OPENROUTER_API_KEY: 'key', NVIDIA_API_KEY: 'nvapi-key' } as NodeJS.ProcessEnv,
      fetchImpl: (async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      }) as FetchLike,
    });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'foo', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.model).toBe('foo');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('integrate.api.nvidia.com');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('treats legacy OpenRouter nvidia/*:free cached rows as OpenRouter when source is absent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-legacy-nvidia-openrouter-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/llama:free']);
    store.writeModelCache({
      models: [{ id: 'nvidia/llama:free', name: 'NVIDIA via OpenRouter', provider: 'nvidia', raw: { id: 'nvidia/llama:free', pricing: { prompt: '0', completion: '0' } } }],
      fetchedAt: new Date().toISOString(),
    });
    const seen: any[] = [];
    await withServer(store, (async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    }) as FetchLike, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      expect(res.status).toBe(200);
      expect(seen[0].url).toContain('openrouter.ai');
      expect(seen[0].body.model).toBe('nvidia/llama:free');
    });
  });

  it('skips selected models whose provider key is missing and tries the next usable model', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-mixed-provider-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/meta/llama-3.1-8b-instruct', 'fast:free']);
    store.writeModelCache({
      models: [
        { id: 'nvidia/meta/llama-3.1-8b-instruct', upstreamId: 'meta/llama-3.1-8b-instruct', name: 'Llama', provider: 'nvidia', source: 'nvidia' },
        { id: 'fast:free', name: 'Fast', provider: 'test', source: 'openrouter', raw: { id: 'fast:free', pricing: { prompt: '0', completion: '0' } } },
      ],
      fetchedAt: new Date().toISOString(),
    });
    store.recordSuccess('nvidia/meta/llama-3.1-8b-instruct', 1);
    store.recordSuccess('fast:free', 10);
    const seen: any[] = [];
    await withServer(store, (async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    }) as FetchLike, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.model).toBe('fast:free');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('openrouter.ai');
    });
  });

  it('avoids retrying a model that just hit a rate limit on the next request', async () => {
    const store = tempStore();
    const calls: string[] = [];
    const mockFetch: FetchLike = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.model);
      if (body.model === 'fast:free') return new Response('{"error":{"message":"rate limit","code":429}}', { status: 429 });
      return Response.json({ id: 'chatcmpl_1', model: body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    };
    await withServer(store, mockFetch, async (base) => {
      const first = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const firstBody = await first.json() as any;
      expect(firstBody.model).toBe('slow:free');
      expect(calls).toEqual(['fast:free', 'slow:free']);
      expect(store.readLatency()['fast:free']?.lastStatus).toBe('rate-limited');
      const second = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const secondBody = await second.json() as any;
      expect(secondBody.model).toBe('slow:free');
      expect(calls).toEqual(['fast:free', 'slow:free', 'slow:free']);
    });
  });

  it('does not let missing-key candidates consume retry attempts before a usable model', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-missing-key-retries-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['nvidia/one', 'nvidia/two', 'openrouter/usable:free']);
    store.writeModelCache({
      models: [
        { id: 'nvidia/one', upstreamId: 'one', name: 'N1', provider: 'nvidia', source: 'nvidia' },
        { id: 'nvidia/two', upstreamId: 'two', name: 'N2', provider: 'nvidia', source: 'nvidia' },
        { id: 'openrouter/usable:free', name: 'Usable', provider: 'openrouter', source: 'openrouter', raw: { id: 'openrouter/usable:free', pricing: { prompt: '0', completion: '0' } } },
      ],
      fetchedAt: new Date().toISOString(),
    });
    store.recordSuccess('nvidia/one', 1);
    store.recordSuccess('nvidia/two', 2);
    store.recordSuccess('openrouter/usable:free', 3);
    const seen: any[] = [];
    await withServer(store, (async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: 'chatcmpl_1', model: seen.at(-1).body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    }) as FetchLike, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.model).toBe('openrouter/usable:free');
      expect(seen).toHaveLength(1);
    });
  });

  it('proxies Anthropic messages through Anthropic skin', async () => {
    const store = tempStore();
    const seen: any[] = [];
    const mockFetch: FetchLike = async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers });
      return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: seen.at(-1).body.model, content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 1, output_tokens: 1 } });
    };
    await withServer(store, mockFetch, async (base) => {
      const res = await fetch(`${base}/anthropic/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'local' }, body: JSON.stringify({ model: 'auto', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }) });
      const body = await res.json() as any;
      expect(body.model).toBe('fast:free');
      expect(seen[0].url).toContain('/api/v1/messages');
    });
  });

  it('falls back to OpenAI translation if Anthropic skin is unavailable', async () => {
    const store = tempStore();
    let calls = 0;
    const mockFetch: FetchLike = async (url, init) => {
      calls += 1;
      if (String(url).includes('/messages')) return new Response('missing', { status: 404 });
      const body = JSON.parse(String(init?.body));
      return Response.json({ id: 'chatcmpl_1', model: body.model, choices: [{ message: { content: 'fallback' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    };
    await withServer(store, mockFetch, async (base) => {
      const res = await fetch(`${base}/anthropic/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_tokens: 10, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }) });
      const body = await res.json() as any;
      expect(body.content[0].text).toBe('fallback');
      expect(calls).toBe(2);
    });
  });

  it('returns actionable error when no models are selected', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-empty-'));
    roots.push(root);
    const store = new ConfigStore(root);
    const server = createOmfmServer({ store, env: { OPENROUTER_API_KEY: 'key' } as NodeJS.ProcessEnv });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [] }) });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('omfm model');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('streaming behavior', () => {
  it('passes OpenAI SSE through without corrupting data frames', async () => {
    const store = tempStore();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const mockFetch: FetchLike = async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    await withServer(store, mockFetch, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] }) });
      const text = await res.text();
      expect(text).toContain('data: {"choices"');
      expect(text).toContain('data: [DONE]');
    });
  });

  it('health does not require an OpenRouter key', async () => {
    const store = tempStore();
    const server = createOmfmServer({ store, env: {} as NodeJS.ProcessEnv });
    const port = await listen(server, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('free-model request boundary', () => {
  it('does not route to a selected non-free model from a tampered config/cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-paid-'));
    roots.push(root);
    const store = new ConfigStore(root);
    store.updateSelectedModelIds(['paid/model']);
    store.writeModelCache({ models: [{ id: 'paid/model', name: 'Paid', provider: 'paid', raw: { id: 'paid/model', pricing: { prompt: '1', completion: '1' } } }], fetchedAt: new Date().toISOString() });
    let called = false;
    const mockFetch: FetchLike = async () => {
      called = true;
      return Response.json({});
    };
    await withServer(store, mockFetch, async (base) => {
      const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'paid/model', messages: [{ role: 'user', content: 'hi' }] }) });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('free models');
      expect(called).toBe(false);
    });
  });
});
