#!/usr/bin/env node
// Run the Vite dev server and the API server together (no extra deps).
// `npm run dev` -> web on :5173 (proxies /api -> :8787), API on :8787.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'api', cmd: 'node', args: ['server/index.js'], color: '\x1b[36m' },
  { name: 'web', cmd: 'npx', args: ['vite'], color: '\x1b[32m' },
];

const children = procs.map(({ name, cmd, args, color }) => {
  const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) =>
    d.toString().split('\n').filter(Boolean).forEach((l) => out.write(tag + l + '\n')));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}exited (${code})`);
    shutdown(code ?? 0);
  });
  return child;
});

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((c) => { try { c.kill('SIGTERM'); } catch {} });
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
