#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'docs/README.ko.md',
  'docs/README.zh-CN.md',
  'docs/README.zh-TW.md',
  'docs/README.ja.md',
  'docs/INSTALLATION.md',
  'docs/INSTALLATION.ko.md',
  'docs/INSTALLATION.zh-CN.md',
  'docs/INSTALLATION.zh-TW.md',
  'docs/INSTALLATION.ja.md',
  'docs/index.md',
  'docs/architecture.md',
  'docs/product.md',
  'docs/provider-guide.md',
  'docs/latency-routing.md',
  'docs/client-compatibility.md',
  'research/index.md',
  'research/providers.md',
  'research/latency-routing.md',
  'research/client-compatibility.md',
  'research/decisions/README.md',
];

const removedDocs = [
  'README.ko.md',
  'README.zh-CN.md',
  'README.zh-TW.md',
  'README.ja.md',
  'INSTALLATION.md',
  'INSTALLATION.ko.md',
  'INSTALLATION.zh-CN.md',
  'INSTALLATION.zh-TW.md',
  'INSTALLATION.ja.md',
  'docs/agent-orientation.md',
  'docs/quality-score.md',
  'docs/tech-debt.md',
  'docs/plans.md',
];

const expectedRoutes = new Map([
  ['AGENTS.md', ['docs/index.md', 'README.md', 'docs/INSTALLATION.md']],
  ['README.md', ['docs/README.ko.md', 'docs/README.zh-CN.md', 'docs/README.zh-TW.md', 'docs/README.ja.md', 'docs/INSTALLATION.md']],
  ['docs/index.md', ['provider-guide.md', 'latency-routing.md', 'client-compatibility.md', 'product.md', 'architecture.md']],
  ['docs/provider-guide.md', ['research/providers.md', 'src/providers', 'test/openrouter.test.ts', 'test/nvidia.test.ts']],
  ['docs/latency-routing.md', ['research/latency-routing.md', 'src/latency', 'test/router.test.ts', 'test/probe.test.ts', 'test/probe-scheduler.test.ts']],
  ['docs/client-compatibility.md', ['research/client-compatibility.md', 'src/server', 'test/server.test.ts', 'test/translate.test.ts']],
  ['research/index.md', ['providers.md', 'latency-routing.md', 'client-compatibility.md', 'decisions/README.md']],
]);

const userFacingDocs = new Set(requiredFiles.filter((file) => /^docs\/(README|INSTALLATION)(\.|$)/.test(file)));
const freshnessFiles = requiredFiles.filter((file) => (file.startsWith('docs/') || file.startsWith('research/')) && !userFacingDocs.has(file));
const freshnessTerms = /update|fresh|maintain|review|refresh|when changing/i;
const compactLineLimit = 180;
const failures = [];

function repoPath(file) {
  return path.join(root, file);
}

function exists(file) {
  return fs.existsSync(repoPath(file));
}

function read(file) {
  return fs.readFileSync(repoPath(file), 'utf8');
}

function normalizeLinkTarget(link, fromFile) {
  const clean = link.split('#')[0].trim();
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('mailto:')) return null;
  const fromDir = path.dirname(fromFile);
  return path.normalize(path.join(fromDir, clean)).replaceAll('\\', '/');
}

function markdownLinks(text) {
  const links = [];
  const inline = /!?\[[^\]\n]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of text.matchAll(inline)) {
    if (!match[0].startsWith('!')) links.push(match[1]);
  }
  const refs = /^\[[^\]\n]+\]:\s*(\S+)/gm;
  for (const match of text.matchAll(refs)) links.push(match[1]);
  return links;
}

function containsRoute(text, route) {
  const variants = new Set([route]);
  if (route.startsWith('docs/')) variants.add(route.slice('docs/'.length));
  if (route.startsWith('research/')) {
    variants.add(route.slice('research/'.length));
    variants.add(`../${route}`);
  }
  if (route.startsWith('src/')) variants.add(`${route}/*`);
  return [...variants].some((variant) => text.includes(variant));
}

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`${file}: required file is missing`);
}

for (const file of removedDocs) {
  if (exists(file)) failures.push(`${file}: obsolete documentation should be removed`);
}

for (const [file, routes] of expectedRoutes) {
  if (!exists(file)) continue;
  const text = read(file);
  for (const route of routes) {
    if (!containsRoute(text, route)) failures.push(`${file}: missing route to ${route}`);
  }
}

for (const file of freshnessFiles) {
  if (!exists(file)) continue;
  const text = read(file);
  const lines = text.split(/\r?\n/).length;
  if (lines > compactLineLimit) failures.push(`${file}: ${lines} lines exceeds compact limit ${compactLineLimit}`);
  if (!freshnessTerms.test(text)) failures.push(`${file}: missing compact update or freshness guidance`);
}

for (const file of requiredFiles) {
  if (!exists(file) || !file.endsWith('.md')) continue;
  const text = read(file);
  for (const link of markdownLinks(text)) {
    const target = normalizeLinkTarget(link, file);
    if (!target) continue;
    if (target.startsWith('..')) failures.push(`${file}: link escapes repository root: ${link}`);
    else if (!exists(target)) failures.push(`${file}: broken local link to ${link}`);
  }
}

if (failures.length > 0) {
  console.error('docs:check failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`docs:check passed (${requiredFiles.length} required files, ${expectedRoutes.size} route checks)`);
