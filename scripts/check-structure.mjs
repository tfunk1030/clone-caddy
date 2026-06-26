#!/usr/bin/env node
// Project sanity check for the React app + API (run by `npm run lint` and CI).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mustExist = (rel) => existsSync(resolve(root, rel)) ? ok(rel) : errors.push(`Missing: ${rel}`);

console.log('CADD-AI structure check\n');

[
  'index.html', 'package.json', 'vite.config.ts', 'tailwind.config.js', 'vercel.json',
  'src/main.tsx', 'src/App.tsx', 'src/index.css',
  'src/context/AuthContext.tsx', 'src/components/layout/AppShell.tsx',
  'src/lib/mapbox.ts', 'src/lib/supabase.ts', 'src/lib/overpass.ts',
  'server/lib.js', 'server/index.js',
].forEach(mustExist);

['Login', 'Dashboard', 'CourseNavigation', 'Dispersion', 'ExpectedStrokes', 'Conditions', 'Forecast', 'Rankings', 'Play', 'Tournament', 'DecadeLabs', 'Settings']
  .forEach((p) => mustExist(`src/pages/${p}.tsx`));
['src/lib/expectedStrokes.ts', 'src/lib/shotModel.ts', 'src/components/GreenMap.tsx',
 'src/lib/holes.ts', 'src/lib/holeStrategy.ts', 'src/lib/teeStrategy.ts',
 'src/lib/clubs.ts', 'src/lib/playing.ts',
 'src/context/ProfileContext.tsx'].forEach(mustExist);

for (const fn of ['health', 'geocode', 'weather', 'conditions', 'course']) {
  const p = resolve(root, 'api', `${fn}.js`);
  if (existsSync(p) && readFileSync(p, 'utf8').includes('export default')) ok(`api/${fn}.js`);
  else errors.push(`api/${fn}.js missing or has no default export`);
}

// App wires each route.
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
for (const r of ['course', 'dispersion', 'expected-strokes', 'conditions', 'forecast', 'rankings', 'play', 'tournament', 'decade-labs', 'settings']) {
  if (app.includes(`path="${r}"`)) ok(`route /${r}`);
  else errors.push(`App.tsx missing route ${r}`);
}

console.log('');
if (errors.length) {
  console.error('FAILED:\n' + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('All structure checks passed.');
