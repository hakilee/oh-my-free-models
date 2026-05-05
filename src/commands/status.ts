import { ConfigStore } from '../config/store.js';
import { isProcessRunning } from '../daemon/daemon.js';
import { chooseGroupedModel } from '../latency/router.js';

export function getStatus(store = new ConfigStore()) {
  const config = store.readConfig();
  const daemon = store.readDaemon();
  const latency = store.readLatency();
  const bestChoice = config.selectedModelIds.length > 0 ? chooseGroupedModel(config.selectedModelIds, latency, 'auto', config.modelGroups) : undefined;
  const bestLatency = bestChoice ? latency[bestChoice.modelId]?.latencyMs : undefined;
  const best = bestChoice && typeof bestLatency === 'number' && Number.isFinite(bestLatency) ? { id: bestChoice.modelId, latencyMs: bestLatency, reason: bestChoice.reason } : undefined;
  const running = daemon ? isProcessRunning(daemon.pid) : false;
  return { running, daemon, port: daemon?.port ?? config.port, configPath: store.paths.configPath, selectedModelCount: config.selectedModelIds.length, bestModel: best };
}

export function printStatus(store = new ConfigStore()): void {
  const status = getStatus(store);
  console.log(`omfm ${status.running ? 'running' : 'stopped'}`);
  console.log(`port: ${status.port}`);
  console.log(`config: ${status.configPath}`);
  console.log(`selected models: ${status.selectedModelCount}`);
  if (status.bestModel) console.log(`best route: ${status.bestModel.id} (${status.bestModel.latencyMs}ms, ${status.bestModel.reason})`);
  if (status.daemon) console.log(`daemon pid: ${status.daemon.pid}`);
}
