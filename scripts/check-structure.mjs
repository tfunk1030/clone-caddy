#!/usr/bin/env node
// Lightweight project sanity check used by `npm run lint` and CI.
// Verifies the app shell, the four tabs, and every dependency they reference
// actually exist — the original repo shipped with broken ./dependencies paths,
// so this guards against that regression.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const ok = (m) => console.log(`  ✓ ${m}`);

function mustExist(rel) {
  if (existsSync(resolve(root, rel))) ok(rel);
  else errors.push(`Missing file: ${rel}`);
}

console.log('AI Caddie structure check\n');

['index.html', 'src/main.js', 'src/style.css', 'package.json', 'vite.config.js',
 'server/index.js', 'scripts/dev.mjs'].forEach(mustExist);

// API wiring: shell must call the conditions endpoint, server must expose it.
const mainJs = readFileSync(resolve(root, 'src/main.js'), 'utf8');
const serverJs = readFileSync(resolve(root, 'server/index.js'), 'utf8');
for (const route of ['/api/health', '/api/geocode', '/api/conditions', '/api/course']) {
  if (serverJs.includes(`'${route}'`)) ok(`API route ${route}`);
  else errors.push(`server does not define ${route}`);
}
if (mainJs.includes('/api/conditions')) ok('shell calls /api/conditions');
else errors.push('shell does not call /api/conditions');

const tabs = ['play_tab.html', 'prepare_tab.html', 'dispersion_tab.html', 'stats_tab.html'];
tabs.forEach((t) => mustExist(`public/${t}`));

// Resolve every ./dependencies/... reference inside the tabs.
for (const tab of tabs) {
  const p = resolve(root, 'public', tab);
  if (!existsSync(p)) continue;
  const html = readFileSync(p, 'utf8');
  const refs = [...html.matchAll(/\.\/(dependencies\/[A-Za-z0-9_./-]+)/g)].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    if (existsSync(resolve(root, 'public', ref))) ok(`${tab} -> ${ref}`);
    else errors.push(`${tab} references missing ${ref}`);
  }
}

// index.html must mount each tab.
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.js'), 'utf8');
for (const t of tabs) {
  if (main.includes(`/${t}`)) ok(`shell wires /${t}`);
  else errors.push(`index/shell does not reference /${t}`);
}

console.log('');
if (errors.length) {
  console.error('FAILED:\n' + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('All structure checks passed.');
