import http, { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigStore } from '../config/store.js';
import { requireAnyProviderApiKey } from '../config/env.js';
import { loadModelCatalog } from '../providers/catalog.js';
import { postNvidiaChatCompletion } from '../providers/nvidia.js';
import { isFreeOpenRouterModel, postOpenRouterAnthropicMessage, postOpenRouterChatCompletion } from '../providers/openrouter.js';
import { FetchLike, ModelGroups, OmfmModel, ProviderApiKeys } from '../types.js';
import { chooseGroupedModel, orderedCandidates, RouteChoice } from '../latency/router.js';
import { anthropicToOpenAI, openAIToAnthropic } from './translate.js';
import { pipeOpenAIStreamAsAnthropic, pipeWebStreamToNode } from './sse.js';

export interface ServerOptions {
  store?: ConfigStore;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  maxRetries?: number;
  requestLogger?: (event: ServerLogEvent) => void;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export type ServerLogEvent =
  | { type: 'request'; id: number; method: string; path: string }
  | { type: 'response'; id: number; method: string; path: string; statusCode: number; durationMs: number; requestedModel?: string; modelId?: string; routeReason?: RouteChoice['reason'] | 'failover'; observedLatencyMs?: number; stream?: boolean };

interface FormatServerLogEventOptions {
  color?: boolean;
}

function safeLogValue(value: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, '?');
  return sanitized.length > 200 ? `${sanitized.slice(0, 197)}...` : sanitized;
}

function color(value: string, code: number, enabled: boolean | undefined): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

function statusColorCode(statusCode: number): number {
  if (statusCode >= 500) return 31;
  if (statusCode >= 400) return 33;
  return 32;
}

export function formatServerLogEvent(event: ServerLogEvent, options: FormatServerLogEventOptions = {}): string {
  if (event.type === 'request') return `[omfm] #${event.id} ${color('request', 36, options.color)} ${event.method} ${safeLogValue(event.path)}`;
  const statusColor = statusColorCode(event.statusCode);
  const details = [
    `[omfm] #${event.id} ${color('response', statusColor, options.color)}`,
    color(String(event.statusCode), statusColor, options.color),
    `${event.durationMs}ms`,
    event.method,
    safeLogValue(event.path),
  ];
  if (event.requestedModel) details.push(`requested=${safeLogValue(event.requestedModel)}`);
  if (event.modelId) details.push(`model=${safeLogValue(event.modelId)}`);
  if (event.routeReason) details.push(`route=${event.routeReason}`);
  if (typeof event.observedLatencyMs === 'number' && Number.isFinite(event.observedLatencyMs)) details.push(`cached=${event.observedLatencyMs}ms`);
  if (event.stream) details.push('stream=true');
  return details.join(' ');
}

function emitServerLog(logger: ServerOptions['requestLogger'], event: ServerLogEvent): void {
  try {
    logger?.(event);
  } catch {
    // Logging should never break proxying.
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

function headersFromIncoming(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

function sourceOf(model: OmfmModel): 'openrouter' | 'nvidia' {
  return model.source === 'nvidia' ? 'nvidia' : 'openrouter';
}

function upstreamId(model: OmfmModel): string {
  return model.upstreamId ?? (sourceOf(model) === 'nvidia' ? model.id.replace(/^nvidia\//, '') : model.id);
}

function isCachedFreeModel(model: OmfmModel): boolean {
  if (sourceOf(model) === 'nvidia') return model.id.startsWith('nvidia/') || model.provider === 'nvidia';
  if (model.id.endsWith(':free')) return true;
  return Boolean(model.raw && typeof model.raw === 'object' && isFreeOpenRouterModel(model.raw as Parameters<typeof isFreeOpenRouterModel>[0]));
}

async function availableFreeModels(store: ConfigStore, apiKeys: ProviderApiKeys, fetchImpl?: FetchLike) {
  const catalog = await loadModelCatalog({ apiKeys, fetchImpl, store });
  return catalog.models.filter(isCachedFreeModel);
}

interface SelectedModelsResult {
  models: OmfmModel[];
  byId: Map<string, OmfmModel>;
  ids: string[];
  modelGroups: ModelGroups;
}

async function selectedModelSelection(store: ConfigStore, apiKeys: ProviderApiKeys, fetchImpl?: FetchLike): Promise<SelectedModelsResult> {
  const config = store.readConfig();
  const freeModels = await availableFreeModels(store, apiKeys, fetchImpl);
  const selected = new Set(config.selectedModelIds);
  const selectedById = new Map(freeModels.filter((model) => selected.has(model.id)).map((model) => [model.id, model]));
  const models = config.selectedModelIds.map((id) => selectedById.get(id)).filter((model): model is OmfmModel => Boolean(model));
  return {
    models,
    byId: new Map(models.map((model) => [model.id, model])),
    ids: models.map((model) => model.id),
    modelGroups: config.modelGroups,
  };
}

async function selectedModels(store: ConfigStore, apiKeys: ProviderApiKeys, fetchImpl?: FetchLike) {
  const config = store.readConfig();
  const freeModels = await availableFreeModels(store, apiKeys, fetchImpl);
  const selected = new Set(config.selectedModelIds);
  return freeModels.filter((model) => selected.has(model.id));
}

function assertSelectedFree(models: OmfmModel[]): void {
  if (models.length === 0) {
    throw Object.assign(new Error('No free models selected. Run `omfm model` to choose at least one free model.'), { statusCode: 400 });
  }
}

function missingKeyMessage(model: OmfmModel): string {
  return `${sourceOf(model) === 'nvidia' ? 'NVIDIA_API_KEY' : 'OPENROUTER_API_KEY'} is required for ${model.id}.`;
}

function withUpstreamModel(body: any, model: OmfmModel): any {
  return { ...body, model: upstreamId(model) };
}

function requestedModelForRouting(models: OmfmModel[], requestedModel: unknown): string | undefined {
  if (typeof requestedModel !== 'string') return undefined;
  if (models.some((model) => model.id === requestedModel)) return requestedModel;
  const upstreamMatch = models.find((model) => upstreamId(model) === requestedModel);
  return upstreamMatch?.id ?? requestedModel;
}

function noUsableModelResponse(res: ServerResponse, lastError: unknown): void {
  json(res, 400, { error: { message: 'No selected free models are usable with the configured provider API keys.', details: String(lastError ?? '') } });
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

function usageFromResponse(data: Record<string, any> | undefined): { inputTokens?: number; outputTokens?: number; totalTokens?: number } {
  const usage = data?.usage;
  if (!usage || typeof usage !== 'object') return {};
  const inputTokens = numberValue(usage.prompt_tokens) ?? numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.completion_tokens) ?? numberValue(usage.output_tokens);
  const totalTokens = numberValue(usage.total_tokens) ?? (inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined);
  return { inputTokens, outputTokens, totalTokens };
}

function estimateInputTokens(body: unknown): number {
  const text = JSON.stringify(body ?? {});
  return Math.max(1, Math.ceil(text.length / 4));
}

function recordSuccessfulUsage(store: ConfigStore, modelId: string, httpStatus: number, data?: Record<string, any>): void {
  store.recordUsage(modelId, { success: true, httpStatus, ...usageFromResponse(data) });
}

async function recordUpstreamFailure(store: ConfigStore, modelId: string, upstream: Response): Promise<string> {
  const text = await upstream.text();
  const status = upstream.status === 429 ? 'rate-limited' : upstream.status === 402 ? 'payment' : 'failed';
  store.recordFailure(modelId, { status, httpStatus: upstream.status, error: text.slice(0, 500) });
  store.recordUsage(modelId, { success: false, httpStatus: upstream.status, status });
  return text;
}

async function writeOpenAIAsAnthropic(upstream: Response, res: ServerResponse, body: any, modelId: string, onData?: (data?: Record<string, any>) => void): Promise<void> {
  if (body.stream) {
    onData?.();
    await pipeOpenAIStreamAsAnthropic(upstream.body, res, modelId);
    return;
  }
  const data = await upstream.json() as Record<string, any>;
  onData?.(data);
  json(res, upstream.status, openAIToAnthropic(data, modelId));
}

export function createOmfmServer(options: ServerOptions = {}): http.Server {
  const store = options.store ?? new ConfigStore();
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl;
  const maxRetries = options.maxRetries ?? 2;
  const requestLogger = options.requestLogger;
  let nextRequestId = 0;

  return http.createServer(async (req, res) => {
    const id = ++nextRequestId;
    const startedAt = Date.now();
    let requestedModel: string | undefined;
    let routedModel: string | undefined;
    let routeReason: RouteChoice['reason'] | 'failover' | undefined;
    let observedLatencyMs: number | undefined;
    let stream: boolean | undefined;
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (requestLogger) {
        emitServerLog(requestLogger, { type: 'request', id, method, path: url.pathname });
        res.once('finish', () => {
          emitServerLog(requestLogger, {
            type: 'response',
            id,
            method,
            path: url.pathname,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            requestedModel,
            modelId: routedModel,
            routeReason,
            observedLatencyMs,
            stream,
          });
        });
      }
      if (method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true, service: 'oh-my-free-models' });
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/models') {
        const apiKeys = requireAnyProviderApiKey(env, store.paths.root);
        const models = await selectedModels(store, apiKeys, fetchImpl);
        json(res, 200, { object: 'list', data: models.map((model) => ({ id: model.id, object: 'model', created: 0, owned_by: sourceOf(model), provider: model.provider })) });
        return;
      }

      if (method === 'POST' && (url.pathname === '/anthropic/v1/messages/count_tokens' || url.pathname === '/anthropic/messages/count_tokens')) {
        const body = await readBody(req);
        requestedModel = stringValue(body.model);
        json(res, 200, { input_tokens: estimateInputTokens(body) });
        return;
      }

      if (method === 'POST' && url.pathname === '/v1/chat/completions') {
        const apiKeys = requireAnyProviderApiKey(env, store.paths.root);
        const body = await readBody(req);
        requestedModel = stringValue(body.model);
        stream = Boolean(body.stream);
        const selected = await selectedModelSelection(store, apiKeys, fetchImpl);
        assertSelectedFree(selected.models);
        const observations = store.readLatency();
        const routingModel = requestedModelForRouting(selected.models, body.model);
        const routeChoice = requestLogger ? chooseGroupedModel(selected.ids, observations, routingModel, selected.modelGroups) : undefined;
        const candidateIds = orderedCandidates(selected.ids, observations, routingModel, selected.modelGroups);
        let lastError: unknown;
        let attempts = 0;
        for (const modelId of candidateIds) {
          if (attempts >= maxRetries) break;
          const model = selected.byId.get(modelId);
          if (!model) continue;
          const apiKey = apiKeys[sourceOf(model)];
          if (!apiKey) {
            lastError = missingKeyMessage(model);
            continue;
          }
          if (requestLogger) {
            routedModel = modelId;
            routeReason = modelId === routeChoice?.modelId ? routeChoice.reason : 'failover';
            observedLatencyMs = numberValue(observations[modelId]?.latencyMs);
          }
          attempts += 1;
          const started = Date.now();
          const upstreamBody = withUpstreamModel(body, model);
          const upstream = sourceOf(model) === 'nvidia'
            ? await postNvidiaChatCompletion({ apiKey, body: upstreamBody, fetchImpl })
            : await postOpenRouterChatCompletion({ apiKey, body: upstreamBody, stream, fetchImpl });
          if (upstream.ok) {
            store.recordSuccess(modelId, Date.now() - started);
            if (stream) {
              recordSuccessfulUsage(store, modelId, upstream.status);
              res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8' });
              await pipeWebStreamToNode(upstream.body, res);
              return;
            }
            const data = await upstream.json() as Record<string, any>;
            recordSuccessfulUsage(store, modelId, upstream.status, data);
            json(res, upstream.status, data);
            return;
          }
          lastError = await recordUpstreamFailure(store, modelId, upstream);
        }
        if (attempts === 0) {
          noUsableModelResponse(res, lastError);
          return;
        }
        json(res, 502, { error: { message: 'All selected free models failed.', details: String(lastError ?? '') } });
        return;
      }

      if (method === 'POST' && (url.pathname === '/anthropic/v1/messages' || url.pathname === '/anthropic/messages')) {
        const apiKeys = requireAnyProviderApiKey(env, store.paths.root);
        const body = await readBody(req);
        requestedModel = stringValue(body.model);
        stream = Boolean(body.stream);
        const selected = await selectedModelSelection(store, apiKeys, fetchImpl);
        assertSelectedFree(selected.models);
        const observations = store.readLatency();
        const routingModel = requestedModelForRouting(selected.models, body.model);
        const routeChoice = requestLogger ? chooseGroupedModel(selected.ids, observations, routingModel, selected.modelGroups) : undefined;
        const candidateIds = orderedCandidates(selected.ids, observations, routingModel, selected.modelGroups);
        let lastError: unknown;
        let attempts = 0;
        for (const modelId of candidateIds) {
          if (attempts >= maxRetries) break;
          const model = selected.byId.get(modelId);
          if (!model) continue;
          const apiKey = apiKeys[sourceOf(model)];
          if (!apiKey) {
            lastError = missingKeyMessage(model);
            continue;
          }
          if (requestLogger) {
            routedModel = modelId;
            routeReason = modelId === routeChoice?.modelId ? routeChoice.reason : 'failover';
            observedLatencyMs = numberValue(observations[modelId]?.latencyMs);
          }
          attempts += 1;
          const started = Date.now();
          if (sourceOf(model) === 'nvidia') {
            const fallbackBody = anthropicToOpenAI(body, upstreamId(model));
            const upstream = await postNvidiaChatCompletion({ apiKey, body: fallbackBody, fetchImpl });
            if (upstream.ok) {
              store.recordSuccess(modelId, Date.now() - started);
              await writeOpenAIAsAnthropic(upstream, res, body, modelId, (data) => recordSuccessfulUsage(store, modelId, upstream.status, data));
              return;
            }
            lastError = await recordUpstreamFailure(store, modelId, upstream);
            continue;
          }

          const upstreamBody = withUpstreamModel(body, model);
          let upstream = await postOpenRouterAnthropicMessage({ apiKey, body: upstreamBody, headers: headersFromIncoming(req), fetchImpl });
          if (!upstream.ok && (upstream.status === 404 || upstream.status === 405)) {
            const fallbackBody = anthropicToOpenAI(body, upstreamId(model));
            upstream = await postOpenRouterChatCompletion({ apiKey, body: fallbackBody, stream, fetchImpl });
            if (upstream.ok) {
              store.recordSuccess(modelId, Date.now() - started);
              await writeOpenAIAsAnthropic(upstream, res, body, modelId, (data) => recordSuccessfulUsage(store, modelId, upstream.status, data));
              return;
            }
          }
          if (upstream.ok) {
            store.recordSuccess(modelId, Date.now() - started);
            if (stream) {
              recordSuccessfulUsage(store, modelId, upstream.status);
              res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8' });
              await pipeWebStreamToNode(upstream.body, res);
              return;
            }
            const data = await upstream.json() as Record<string, any>;
            recordSuccessfulUsage(store, modelId, upstream.status, data);
            json(res, upstream.status, data);
            return;
          }
          lastError = await recordUpstreamFailure(store, modelId, upstream);
        }
        if (attempts === 0) {
          noUsableModelResponse(res, lastError);
          return;
        }
        json(res, 502, { error: { type: 'api_error', message: 'All selected free models failed.', details: String(lastError ?? '') } });
        return;
      }

      json(res, 404, { error: { message: `Unsupported endpoint: ${method} ${url.pathname}` } });
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
      json(res, statusCode, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
  });
}

export async function listen(server: http.Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  return typeof address === 'object' && address ? address.port : port;
}
