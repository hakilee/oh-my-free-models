import fs from 'node:fs';
import { getConfigRoot, getEnvPath } from './paths.js';
import { ProviderApiKeys } from '../types.js';

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function readLocalEnv(root = getConfigRoot()): Record<string, string> {
  const envPath = getEnvPath(root);
  if (!fs.existsSync(envPath)) return {};
  return parseDotEnv(fs.readFileSync(envPath, 'utf8'));
}

export function resolveOpenRouterApiKey(env: NodeJS.ProcessEnv = process.env, root = getConfigRoot(env)): string | undefined {
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()) return env.OPENROUTER_API_KEY.trim();
  const local = readLocalEnv(root);
  return local.OPENROUTER_API_KEY?.trim() || undefined;
}

export function resolveNvidiaApiKey(env: NodeJS.ProcessEnv = process.env, root = getConfigRoot(env)): string | undefined {
  if (env.NVIDIA_API_KEY && env.NVIDIA_API_KEY.trim()) return env.NVIDIA_API_KEY.trim();
  const local = readLocalEnv(root);
  return local.NVIDIA_API_KEY?.trim() || undefined;
}

export function resolveProviderApiKeys(env: NodeJS.ProcessEnv = process.env, root = getConfigRoot(env)): ProviderApiKeys {
  return {
    openrouter: resolveOpenRouterApiKey(env, root),
    nvidia: resolveNvidiaApiKey(env, root),
  };
}

export function requireAnyProviderApiKey(env: NodeJS.ProcessEnv = process.env, root = getConfigRoot(env)): ProviderApiKeys {
  const keys = resolveProviderApiKeys(env, root);
  if (!keys.openrouter && !keys.nvidia) {
    throw new Error(`OPENROUTER_API_KEY or NVIDIA_API_KEY is required. Set one globally or add it to ${getEnvPath(root)}.`);
  }
  return keys;
}
