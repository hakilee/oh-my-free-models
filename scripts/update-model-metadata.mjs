#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, 'data', 'model-metadata.json');
const requestHeaders = {
  Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
  'User-Agent': 'oh-my-free-models/metadata-update',
};

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const NVIDIA_NGC_ORG = 'qc69jvmznzxy';
const NVIDIA_CATALOG_URL = 'https://api.ngc.nvidia.com/v2/search/catalog/resources/ENDPOINT';
const NVIDIA_ENDPOINT_BASE_URL = `https://api.ngc.nvidia.com/v2/endpoints/${NVIDIA_NGC_ORG}`;
const NVIDIA_CATALOG_PAGE_SIZE = 200;
const NVIDIA_ENDPOINT_CONCURRENCY = 8;

function titleFromId(id) {
  return (id.split('/').pop() || id)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function withoutFreeSuffix(id) {
  return id.replace(/:free$/, '');
}

function rowKey(row) {
  return `${row.source}:${withoutFreeSuffix(row.id)}`;
}

function stringField(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function objectRows(payload) {
  if (Array.isArray(payload)) return payload.filter(isObjectRecord);
  if (!isObjectRecord(payload)) return [];
  return Array.isArray(payload.data) ? payload.data.filter(isObjectRecord) : [];
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(url) {
  const response = await fetch(url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function readText(url) {
  const response = await fetch(url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function readCheckedInRows() {
  if (!existsSync(outputPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    return Array.isArray(parsed.models)
      ? parsed.models.filter((row) => isObjectRecord(row) && typeof row.source === 'string' && typeof row.id === 'string')
      : [];
  } catch {
    return [];
  }
}

function mergeRow(rows, row) {
  if (!row.id || !row.source) return;
  const key = rowKey(row);
  const current = rows.get(key);
  const contextLength = parseTokenCount(row.contextLength) ?? parseTokenCount(current?.contextLength);
  const metadataSources = [...new Set([...(current?.metadataSources ?? []), ...(row.metadataSources ?? [])])].sort();
  const next = {
    ...current,
    ...row,
    metadataSources,
  };

  if (contextLength) next.contextLength = Math.round(contextLength);
  else delete next.contextLength;

  rows.set(key, next);
}

function replaceSourceRows(rows, source, freshRows) {
  for (const [key, row] of rows) {
    if (row.source === source) rows.delete(key);
  }
  for (const row of freshRows) mergeRow(rows, row);
}

function parseTokenCount(value, options = {}) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/i);
  if (!match) return undefined;
  return parseTokenCountParts(match[1], match[2], options);
}

function parseTokenCountParts(rawNumber, rawUnit, options = {}) {
  const number = Number(rawNumber.replace(/,/g, ''));
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const unit = rawUnit?.toLowerCase();
  if (!unit && options.rejectSmallUnitless && number < 1024) return undefined;
  const multiplier = unit === 'm' || unit === 'million' ? 1_000_000 : unit === 'k' || unit === 'thousand' ? 1_000 : 1;
  return Math.round(number * multiplier);
}

function extractContextLengthFromRecord(record) {
  if (!isObjectRecord(record)) return undefined;

  const keys = [
    'context_length',
    'max_context_length',
    'contextLength',
    'maxContextLength',
    'context_window',
    'contextWindow',
    'context_size',
    'contextSize',
    'max_model_len',
    'maxModelLen',
    'input_context_length',
    'inputContextLength',
    'max_input_tokens',
    'maxInputTokens',
  ];
  const containers = ['metadata', 'capabilities', 'model_config', 'modelConfig', 'config', 'limits'];

  for (const key of keys) {
    const contextLength = parseTokenCount(record[key]);
    if (contextLength) return contextLength;
  }

  for (const key of containers) {
    const container = record[key];
    if (!isObjectRecord(container)) continue;
    for (const contextKey of keys) {
      const contextLength = parseTokenCount(container[contextKey]);
      if (contextLength) return contextLength;
    }
  }

  return undefined;
}

function normalizeMetadataText(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\u003[eE]/g, '>')
    .replace(/\\u003[cC]/g, '<')
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function parseContextLengthFromText(text) {
  const normalized = normalizeMetadataText(text);
  const candidates = [];
  const patterns = [
    {
      pattern: /(?:maximum|max|input)?\s*context\s+length(?:\s*\([^)]+\))?[^0-9]{0,80}?(?:up to|of|is|:|\|)?\s*([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?(?:\s*tokens?)?/gi,
      score: 100,
    },
    {
      pattern: /context\s+(?:window|size)[^0-9]{0,80}?(?:up to|of|is|:|\|)?\s*([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?(?:\s*tokens?)?/gi,
      score: 95,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s*[- ]?\s*tokens?\s+context\s+(?:window|length|size)s?/gi,
      score: 85,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s*tokens?\s+(?:of|for)\s+context\b/gi,
      score: 80,
    },
    {
      pattern: /([0-9][\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\s+context\b/gi,
      score: 75,
    },
  ];

  for (const { pattern, score } of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const contextLength = parseTokenCountParts(match[1], match[2], { rejectSmallUnitless: true });
      if (contextLength) candidates.push({ contextLength, score, index: match.index ?? 0 });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.contextLength - a.contextLength || a.index - b.index);
  return candidates[0]?.contextLength;
}

function contextLengthFromTextFields(record) {
  const text = [
    stringField(record?.shortDescription),
    stringField(record?.description),
    stringField(record?.displayName),
  ]
    .filter(Boolean)
    .join(' ');
  return text ? parseContextLengthFromText(text) : undefined;
}

function contextLengthFromNvidiaRecord(record) {
  return extractContextLengthFromRecord(record) ?? contextLengthFromTextFields(record);
}

function isFreeOpenRouterModel(model) {
  const id = stringField(model.id);
  if (!id) return false;
  const architecture = isObjectRecord(model.architecture) ? model.architecture : undefined;
  const modalities = Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : undefined;
  const textCapable = !modalities || modalities.includes('text');
  if (!textCapable) return false;
  if (id.endsWith(':free')) return true;
  const pricing = isObjectRecord(model.pricing) ? model.pricing : undefined;
  const prompt = Number(pricing?.prompt);
  const completion = Number(pricing?.completion);
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

async function collectOpenRouterRows() {
  const payload = await readJson(OPENROUTER_MODELS_URL);
  const rows = [];
  for (const model of objectRows(payload)) {
    if (!isFreeOpenRouterModel(model)) continue;
    const id = stringField(model.id);
    const contextLength = extractContextLengthFromRecord(model);
    if (!id) continue;
    rows.push({
      source: 'openrouter',
      id,
      name: stringField(model.name) ?? titleFromId(id),
      ...(contextLength ? { contextLength } : {}),
      metadataSources: ['openrouter.ai/api/v1/models'],
    });
  }
  return rows;
}

function nvidiaCatalogQuery(page) {
  return {
    query: `orgName:"${NVIDIA_NGC_ORG}"`,
    filters: [],
    orderBy: [{ field: 'score', value: 'DESC' }],
    page,
    pageSize: NVIDIA_CATALOG_PAGE_SIZE,
    scoredSize: NVIDIA_CATALOG_PAGE_SIZE,
  };
}

function nvidiaCatalogUrl(page) {
  const query = encodeURIComponent(JSON.stringify(nvidiaCatalogQuery(page)));
  return `${NVIDIA_CATALOG_URL}?q=${query}&group-labels-by-labelset=true`;
}

function nvidiaCatalogResources(payload) {
  if (!isObjectRecord(payload) || !Array.isArray(payload.results)) return [];
  return payload.results.flatMap((group) => (Array.isArray(group.resources) ? group.resources.filter(isObjectRecord) : []));
}

async function collectNvidiaCatalogResources() {
  const firstPage = await readJson(nvidiaCatalogUrl(0));
  const resources = nvidiaCatalogResources(firstPage);
  const total = Number(firstPage.resultTotal ?? resources.length);
  const pages = Number.isFinite(total) && total > resources.length ? Math.ceil(total / NVIDIA_CATALOG_PAGE_SIZE) : 1;

  for (let page = 1; page < pages; page += 1) {
    resources.push(...nvidiaCatalogResources(await readJson(nvidiaCatalogUrl(page))));
  }

  const uniqueResources = new Map();
  for (const resource of resources) {
    const id = nvidiaIdFromResource(resource) ?? stringField(resource.name);
    if (id && !uniqueResources.has(id)) uniqueResources.set(id, resource);
  }

  return [...uniqueResources.values()];
}

function labelValues(labels, key) {
  if (!Array.isArray(labels)) return [];
  return labels
    .filter((label) => isObjectRecord(label) && label.key === key)
    .flatMap((label) => [
      ...(Array.isArray(label.values) ? label.values : []),
      ...(Array.isArray(label.unresolvedValues) ? label.unresolvedValues : []),
    ])
    .filter((value) => typeof value === 'string' && value.trim());
}

function nvidiaPublisher(record) {
  const direct = stringField(record.publisher);
  if (direct) return direct;
  return stringField(labelValues(record.labels, 'publisher')[0]);
}

function nvidiaIdFromResource(resource) {
  const publisher = nvidiaPublisher(resource);
  const name = stringField(resource.name);
  return publisher && name ? `${publisher}/${name}` : undefined;
}

async function readNvidiaEndpoint(resourceName) {
  return readJson(`${NVIDIA_ENDPOINT_BASE_URL}/${encodeURIComponent(resourceName)}`);
}

function modelSpecificNvidiaPageText(text, id) {
  const normalized = normalizeMetadataText(text);
  const modelName = id.split('/').pop() ?? id;
  const needles = [id, modelName, modelName.replace(/[-_]/g, ' ')].filter(Boolean);
  const lower = normalized.toLowerCase();
  const snippets = [];

  for (const needle of needles) {
    const search = needle.toLowerCase();
    let index = -1;
    while ((index = lower.indexOf(search, index + 1)) >= 0) {
      snippets.push(normalized.slice(Math.max(0, index - 2_000), index + 2_000));
    }
  }

  return snippets.length > 0 ? snippets.join(' ') : normalized.slice(0, 80_000);
}

async function readNvidiaBuildContextLength(id) {
  const url = `https://build.nvidia.com/${id}/modelcard`;
  const text = await readText(url);
  return parseContextLengthFromText(modelSpecificNvidiaPageText(text, id));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function collectNvidiaRows() {
  const resources = await collectNvidiaCatalogResources();
  const rows = [];

  await mapLimit(resources, NVIDIA_ENDPOINT_CONCURRENCY, async (resource) => {
    const id = nvidiaIdFromResource(resource);
    const resourceName = stringField(resource.name);
    if (!id || !resourceName) return;

    const metadataSources = ['api.ngc.nvidia.com/v2/search/catalog/resources/ENDPOINT'];
    let detail;
    try {
      detail = await readNvidiaEndpoint(resourceName);
      metadataSources.push(`api.ngc.nvidia.com/v2/endpoints/${NVIDIA_NGC_ORG}/${resourceName}`);
    } catch (error) {
      console.warn(`NVIDIA endpoint detail skipped: ${resourceName} (${error instanceof Error ? error.message : String(error)})`);
    }

    const artifact = isObjectRecord(detail?.artifact) ? detail.artifact : undefined;
    let contextLength = contextLengthFromNvidiaRecord(artifact) ?? contextLengthFromNvidiaRecord(resource);
    if (!contextLength) {
      try {
        contextLength = await readNvidiaBuildContextLength(id);
        if (contextLength) metadataSources.push(`build.nvidia.com/${id}/modelcard`);
      } catch {
        // Build pages are a final best-effort source; rows without context remain useful metadata.
      }
    }

    rows.push({
      source: 'nvidia',
      id,
      name: stringField(artifact?.displayName) ?? stringField(resource.displayName) ?? titleFromId(id),
      ...(contextLength ? { contextLength } : {}),
      metadataSources,
    });
  });

  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

async function updateSource(rows, source, label, collect) {
  try {
    const freshRows = await collect();
    replaceSourceRows(rows, source, freshRows);
    return `${label}: ${freshRows.length}`;
  } catch (error) {
    console.warn(`${label} metadata update failed; preserving checked-in rows: ${error instanceof Error ? error.message : String(error)}`);
    return `${label}: preserved`;
  }
}

async function main() {
  const rows = new Map();
  for (const row of readCheckedInRows()) mergeRow(rows, row);

  const summary = [];
  summary.push(await updateSource(rows, 'openrouter', 'OpenRouter', collectOpenRouterRows));
  summary.push(await updateSource(rows, 'nvidia', 'NVIDIA', collectNvidiaRows));

  const models = [...rows.values()].sort((a, b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, models }, null, 2)}\n`);
  console.log(`Updated ${outputPath}`);
  console.log(`Rows: ${models.length} (${summary.join(', ')})`);
}

await main();
