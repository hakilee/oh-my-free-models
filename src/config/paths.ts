import os from 'node:os';
import path from 'node:path';

export function getConfigRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.OMFM_HOME || path.join(os.homedir(), '.oh-my-free-models');
}

export function getConfigPath(root = getConfigRoot()): string {
  return path.join(root, 'config.json');
}

export function getLatencyPath(root = getConfigRoot()): string {
  return path.join(root, 'latency.json');
}

export function getUsagePath(root = getConfigRoot()): string {
  return path.join(root, 'usage.json');
}

export function getModelCachePath(root = getConfigRoot()): string {
  return path.join(root, 'models-cache.json');
}

export function getDaemonPath(root = getConfigRoot()): string {
  return path.join(root, 'daemon.json');
}

export function getEnvPath(root = getConfigRoot()): string {
  return path.join(root, '.env');
}

export function getLogPath(root = getConfigRoot()): string {
  return path.join(root, 'omfm.log');
}
