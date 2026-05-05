import { Writable } from 'node:stream';
import { requireAnyProviderApiKey } from '../config/env.js';
import { ConfigStore } from '../config/store.js';
import { ProbeResult, probeProviderModel } from '../latency/probe.js';
import { runProbeScheduler } from '../latency/probe-scheduler.js';
import { isCoolingDown } from '../latency/router.js';
import { normalizeModelGroupName } from '../model-groups.js';
import { loadModelCatalog } from '../providers/catalog.js';
import { FetchLike, ModelGroupName, ModelSource, OmfmModel, ProviderApiKeys } from '../types.js';
import { buildModelRows, filterListableModelRows, ModelDisplayRow, renderStaticModelTable, sortModelRows } from './model-view.js';
import { runModelTui } from './model-tui.js';

interface OutputLike {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

type InputLike = NodeJS.ReadStream;

export interface RunModelCommandOptions {
  select?: string[];
  all?: boolean;
  json?: boolean;
  best?: boolean;
  group?: string;
  store?: ConfigStore;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  stdout?: OutputLike;
  stderr?: OutputLike;
  stdin?: InputLike;
  runTui?: typeof runModelTui;
  runScheduler?: typeof runProbeScheduler;
}

function writeLine(output: OutputLike, text: string): void {
  output.write(`${text}\n`);
}

function sourceOf(model: OmfmModel): ModelSource {
  return model.source === 'nvidia' ? 'nvidia' : 'openrouter';
}

function candidateModels(models: OmfmModel[], selectedIds: string[]): OmfmModel[] {
  if (selectedIds.length === 0) return models;
  const byId = new Map(models.map((model) => [model.id, model]));
  return selectedIds.map((id) => byId.get(id)).filter((model): model is OmfmModel => Boolean(model));
}

function candidateIdsForGroup(config: ReturnType<ConfigStore['readConfig']>, group: ModelGroupName | undefined): string[] {
  if (!group) return config.selectedModelIds;
  const selected = new Set(config.selectedModelIds);
  const ids = [...new Set(config.modelGroups[group])].filter((id) => selected.has(id));
  return ids.length > 0 ? ids : config.selectedModelIds;
}

function bestCachedModel(models: OmfmModel[], store: ConfigStore): { model: OmfmModel; latencyMs: number } | undefined {
  const latency = store.readLatency();
  const decorated = models
    .map((model, index) => ({ model, index, obs: latency[model.id], latencyMs: latency[model.id]?.latencyMs }))
    .filter((item): item is { model: OmfmModel; index: number; obs: typeof item.obs; latencyMs: number } => typeof item.latencyMs === 'number' && Number.isFinite(item.latencyMs))
    .sort((a, b) => a.latencyMs - b.latencyMs || a.index - b.index || a.model.id.localeCompare(b.model.id));
  return decorated.find((item) => !isCoolingDown(item.obs)) ?? decorated[0];
}

async function runBestModel(options: { models: OmfmModel[]; apiKeys: ProviderApiKeys; store: ConfigStore; fetchImpl?: FetchLike; runScheduler?: typeof runProbeScheduler }): Promise<{ model: OmfmModel; latencyMs?: number; status: string; probed: boolean }> {
  if (options.models.length === 0) throw new Error('No current models are available for best-model selection. Run `omfm model` to refresh the model list.');
  const results = new Map<string, ProbeResult>();
  const runScheduler = options.runScheduler ?? runProbeScheduler;
  await runScheduler({
    models: options.models,
    store: options.store,
    probe: async (model, signal) => {
      const apiKey = options.apiKeys[sourceOf(model)];
      if (!apiKey) return { modelId: model.id, status: 'failed', error: `Missing API key for ${sourceOf(model)}` };
      return probeProviderModel({ apiKey, model, fetchImpl: options.fetchImpl, signal, timeoutMs: 10_000 });
    },
    onUpdate: ({ modelId, result }) => results.set(modelId, result),
  });
  const modelOrder = new Map(options.models.map((model, index) => [model.id, index]));
  const fresh = [...results.values()]
    .filter((result): result is ProbeResult & { latencyMs: number } => result.status === 'ok' && typeof result.latencyMs === 'number' && Number.isFinite(result.latencyMs))
    .sort((a, b) =>
      a.latencyMs - b.latencyMs
      || (modelOrder.get(a.modelId) ?? Number.MAX_SAFE_INTEGER) - (modelOrder.get(b.modelId) ?? Number.MAX_SAFE_INTEGER)
      || a.modelId.localeCompare(b.modelId),
    )[0];
  if (fresh) {
    const model = options.models.find((candidate) => candidate.id === fresh.modelId)!;
    return { model, latencyMs: Math.round(fresh.latencyMs), status: fresh.status, probed: true };
  }
  const cached = bestCachedModel(options.models, options.store);
  if (cached) return { model: cached.model, latencyMs: cached.latencyMs, status: 'cached', probed: false };
  throw new Error('No model responded successfully during best-model probe.');
}

async function loadModels(options: { apiKeys: ProviderApiKeys; fetchImpl?: FetchLike; store: ConfigStore; json?: boolean; stderr: OutputLike }): Promise<OmfmModel[]> {
  const catalog = await loadModelCatalog({ apiKeys: options.apiKeys, fetchImpl: options.fetchImpl, store: options.store });
  if (!options.json) {
    if (catalog.source === 'fetched' && catalog.errors.length > 0) writeLine(options.stderr, `Using partial provider results: ${catalog.errors.join('; ')}`);
    if (catalog.source === 'stale') writeLine(options.stderr, `Using cached models because provider fetch failed: ${catalog.errors.join('; ')}`);
  }
  return catalog.models;
}

function listableModelRows(models: OmfmModel[], selectedIds: Set<string>, store: ConfigStore): ModelDisplayRow[] {
  const latency = store.readLatency();
  return filterListableModelRows(buildModelRows(models, selectedIds, latency), latency);
}

export async function runModelCommand(options: RunModelCommandOptions = {}): Promise<void> {
  const store = options.store ?? new ConfigStore();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  store.ensureRoot();
  const apiKeys = requireAnyProviderApiKey(options.env ?? process.env, store.paths.root);
  const models = await loadModels({ apiKeys, fetchImpl: options.fetchImpl, store, json: options.json, stderr });

  const config = store.readConfig();
  const current = new Set(config.selectedModelIds);
  const group = normalizeModelGroupName(options.group);
  if (options.group && !group) throw new Error(`Invalid --group value: ${options.group}. Use fast, balanced, or capable.`);
  if (options.best) {
    const result = await runBestModel({ models: candidateModels(models, candidateIdsForGroup(config, group)), apiKeys, store, fetchImpl: options.fetchImpl, runScheduler: options.runScheduler });
    if (options.json) {
      writeLine(stdout, JSON.stringify({ bestModelId: result.model.id, model: result.model, latencyMs: result.latencyMs, status: result.status, probed: result.probed }, null, 2));
    } else {
      writeLine(stdout, result.model.id);
    }
    return;
  }

  if (options.all) {
    const ids = sortModelRows(listableModelRows(models, new Set(), store)).map((row) => row.model.id);
    if (group) store.updateModelGroup(group, ids);
    else store.updateSelectedModelIds(ids);
  } else if (options.select) {
    const freeIds = new Set(listableModelRows(models, new Set(), store).map((row) => row.model.id));
    const invalid = options.select.filter((id) => !freeIds.has(id));
    if (invalid.length > 0) {
      throw new Error(`Selected model IDs are not current free models: ${invalid.join(', ')}`);
    }
    if (group) store.updateModelGroup(group, options.select);
    else store.updateSelectedModelIds(options.select);
  } else if (!options.json && stdout.isTTY) {
    const runTui = options.runTui ?? runModelTui;
    const result = await runTui({
      models,
      selectedModelIds: [...current],
      modelGroups: config.modelGroups,
      initialTab: group ?? 'all',
      store,
      apiKeys,
      stdin: options.stdin,
      stdout: stdout as Writable,
      fetchImpl: options.fetchImpl,
    });
    if (result.saved) {
      store.writeConfig({
        ...store.readConfig(),
        selectedModelIds: result.selectedModelIds,
        modelGroups: result.modelGroups,
      });
    }
    if (result.interrupted) process.exitCode = 130;
  }

  if (options.json) {
    const nextConfig = store.readConfig();
    const listableModels = listableModelRows(models, new Set(nextConfig.selectedModelIds), store).map((row) => row.model);
    writeLine(stdout, JSON.stringify({ models: listableModels, selectedModelIds: nextConfig.selectedModelIds, modelGroups: nextConfig.modelGroups }, null, 2));
    return;
  }

  if (!stdout.isTTY || options.all || options.select) {
    const selectedIds = new Set(store.readConfig().selectedModelIds);
    stdout.write(`Free models:\n${renderStaticModelTable(sortModelRows(listableModelRows(models, selectedIds, store), { selectedFirst: true }))}`);
  }
}
