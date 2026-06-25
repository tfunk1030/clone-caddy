// Local development API server.
//
// In production the API runs as Vercel serverless functions (see /api/*.js).
// For local dev we mount those exact same handlers on a tiny Express server so
// `npm run dev` gives the same routes (Vite proxies /api -> here). This keeps a
// single source of truth — the handlers live in /api and share /server/lib.js.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import health from '../api/health.js';
import geocode from '../api/geocode.js';
import weather from '../api/weather.js';
import conditions from '../api/conditions.js';
import course from '../api/course.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.API_PORT || 8787;

const app = express();
app.get('/api/health', health);
app.get('/api/geocode', geocode);
app.get('/api/weather', weather);
app.get('/api/conditions', conditions);
app.get('/api/course', course);

// Serve the built static app (dist/) when present, so `npm start` can host the
// whole thing from one process locally.
app.use(express.static(join(__dirname, '..', 'dist')));

app.listen(PORT, () => console.log(`[api] AI Caddie API on http://localhost:${PORT}`));
