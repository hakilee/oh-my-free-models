import { requireAnyProviderApiKey } from '../config/env.js';
import { ConfigStore } from '../config/store.js';
import { loadModelCatalog } from '../providers/catalog.js';
import { FetchLike, ModelSource, OmfmModel } from '../types.js';
import { probeProviderModel } from './probe.js';
import { runProbeScheduler } from './probe-scheduler.js';

const DEFAULT_BACKGROUND_PROBE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BACKGROUND_PROBE_INITIAL_DELAY_MS = 1_000;

export interface BackgroundLatencyProber {
  stop: () => void;
}

export interface ProbeSelectedModelsOptions {
  store: ConfigStore;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  runScheduler?: typeof runProbeScheduler;
}

export interface StartBackgroundLatencyProberOptions extends ProbeSelectedModelsOptions {
  intervalMs?: number;
  initialDelayMs?: number;
}

function sourceOf(model: OmfmModel): ModelSource {
  return model.source === 'nvidia' ? 'nvidia' : 'openrouter';
}

export async function probeSelectedModels(options: ProbeSelectedModelsOptions): Promise<void> {
  const apiKeys = requireAnyProviderApiKey(options.env ?? process.env, options.store.paths.root);
  const config = options.store.readConfig();
  if (config.selectedModelIds.length === 0) return;
  const selectedIds = new Set(config.selectedModelIds);
  const catalog = await loadModelCatalog({ apiKeys, fetchImpl: options.fetchImpl, store: options.store });
  const models = catalog.models.filter((model) => selectedIds.has(model.id));
  if (models.length === 0) return;

  await (options.runScheduler ?? runProbeScheduler)({
    models,
    store: options.store,
    concurrency: 2,
    initialConcurrency: 2,
    intervalMs: 500,
    probe: (model, signal) => {
      const apiKey = apiKeys[sourceOf(model)];
      if (!apiKey) return Promise.resolve({ modelId: model.id, status: 'failed', error: `${sourceOf(model)} API key is not configured` });
      return probeProviderModel({ apiKey, model, fetchImpl: options.fetchImpl, signal, timeoutMs: 10_000 });
    },
  });
}

export function startBackgroundLatencyProber(options: StartBackgroundLatencyProberOptions): BackgroundLatencyProber {
  const intervalMs = options.intervalMs ?? DEFAULT_BACKGROUND_PROBE_INTERVAL_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_BACKGROUND_PROBE_INITIAL_DELAY_MS;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void probeSelectedModels(options)
        .catch(() => undefined)
        .finally(() => schedule(intervalMs));
    }, delayMs);
    timer.unref?.();
  };

  schedule(initialDelayMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
