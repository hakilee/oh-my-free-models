import { LatencyObservation } from '../types.js';

const GENERIC_MODELS = new Set(['', 'auto', 'default', 'omfm', 'openrouter/free']);

export interface RouteChoice {
  modelId: string;
  reason: 'requested-selected' | 'lowest-latency' | 'fallback-order';
}

function latencyValue(obs: LatencyObservation | undefined): number | undefined {
  if (!obs) return undefined;
  if (!Number.isFinite(obs.latencyMs)) return undefined;
  return obs.latencyMs;
}

export function isCoolingDown(obs: LatencyObservation | undefined): boolean {
  if (!obs?.cooldownUntil) return false;
  const until = Date.parse(obs.cooldownUntil);
  return Number.isFinite(until) && until > Date.now();
}

function statusRank(obs: LatencyObservation | undefined): number {
  if (isCoolingDown(obs)) return 2;
  if (obs?.lastStatus && obs.lastStatus !== 'ok' && !obs.cooldownUntil) return 1;
  return 0;
}

function pickLowestLatency(ids: string[], observations: Record<string, LatencyObservation>): string | undefined {
  const withLatency = ids
    .map((modelId, index) => ({ modelId, index, latency: latencyValue(observations[modelId]), rank: statusRank(observations[modelId]) }))
    .filter((item): item is { modelId: string; index: number; latency: number; rank: number } => item.latency !== undefined)
    .sort((a, b) => a.rank - b.rank || a.latency - b.latency || a.index - b.index || a.modelId.localeCompare(b.modelId));
  return withLatency[0]?.modelId;
}

export function chooseModel(selectedModelIds: string[], observations: Record<string, LatencyObservation>, requestedModel?: string): RouteChoice {
  if (selectedModelIds.length === 0) {
    throw new Error('No models selected. Run `omfm model` to choose at least one OpenRouter free model.');
  }

  if (requestedModel && !GENERIC_MODELS.has(requestedModel) && selectedModelIds.includes(requestedModel)) {
    return { modelId: requestedModel, reason: 'requested-selected' };
  }

  const available = selectedModelIds.filter((id) => !isCoolingDown(observations[id]));
  const primary = pickLowestLatency(available, observations);
  if (primary) return { modelId: primary, reason: 'lowest-latency' };

  const fallback = pickLowestLatency(selectedModelIds, observations);
  if (fallback) return { modelId: fallback, reason: 'lowest-latency' };

  return { modelId: selectedModelIds[0]!, reason: 'fallback-order' };
}

export function orderedCandidates(selectedModelIds: string[], observations: Record<string, LatencyObservation>, requestedModel?: string): string[] {
  const first = chooseModel(selectedModelIds, observations, requestedModel).modelId;
  const rest = selectedModelIds.filter((id) => id !== first).sort((a, b) => {
    const ra = statusRank(observations[a]);
    const rb = statusRank(observations[b]);
    if (ra !== rb) return ra - rb;
    const la = latencyValue(observations[a]);
    const lb = latencyValue(observations[b]);
    if (la !== undefined && lb !== undefined) return la - lb || selectedModelIds.indexOf(a) - selectedModelIds.indexOf(b) || a.localeCompare(b);
    if (la !== undefined) return -1;
    if (lb !== undefined) return 1;
    return selectedModelIds.indexOf(a) - selectedModelIds.indexOf(b) || a.localeCompare(b);
  });
  return [first, ...rest];
}
