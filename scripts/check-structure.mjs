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

['index.html', 'src/main.js', 'src/style.css', 'package.json', 'vite.config.js'].forEach(mustExist);

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
