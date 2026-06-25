// AI Caddie API server.
//
// The web tabs talk to OpenStreetMap (Nominatim/Overpass) directly from the
// browser, which (a) violates Nominatim's usage policy (no identifying
// User-Agent) and (b) gives us nowhere to add the weather/condition
// adjustments the product always needed. This small service fills that gap:
//
//   GET /api/health
//   GET /api/geocode?q=Augusta National
//   GET /api/course?q=... | ?lat=&lon=&radius=   (golf features from Overpass)
//   GET /api/weather?lat=&lon=
//   GET /api/conditions?q=... | ?lat=&lon=        (weather + elevation + golf carry adjustment)
//
// It is dependency-light (express only) and keyless — it uses the free,
// no-token Open-Meteo and OpenStreetMap endpoints. If an HTTPS_PROXY is set in
// the environment, outbound requests are routed through it.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Route outbound fetch through a proxy when one is configured (corporate
// networks, sandboxed CI). Falls back to direct fetch when undici/proxy absent.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
  } catch {
    console.warn('[api] HTTPS_PROXY set but undici ProxyAgent unavailable; using direct fetch');
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.API_PORT || 8787;
const UA = 'AI-Caddie/1.0 (https://github.com/sonnejack/AI_Caddie)';

const app = express();
app.use(express.json());

// Permissive CORS so the API can be hosted separately from the static app.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- tiny TTL cache (upstream services are slow & rate-limited) ---
const cache = new Map();
function cached(key, ttlMs, producer) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return Promise.resolve(hit.v);
  return Promise.resolve(producer()).then((v) => {
    cache.set(key, { t: now, v });
    return v;
  });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Upstream ${res.status} for ${url}: ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

// --- geocoding (Nominatim) ---
async function geocode(q, limit = 5) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`;
  const data = await cached(`geo:${limit}:${q.toLowerCase()}`, 24 * 3600e3, () => fetchJson(url));
  return data.map((r) => ({
    name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
    category: r.category,
    osm_id: r.osm_id,
    osm_type: r.osm_type,
    importance: r.importance,
  }));
}

// --- weather + elevation (Open-Meteo, keyless) ---
async function weather(lat, lon) {
  const wUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const eUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  const [w, e] = await cached(`wx:${lat.toFixed(3)},${lon.toFixed(3)}`, 15 * 60e3, () =>
    Promise.all([fetchJson(wUrl), fetchJson(eUrl)]),
  );
  const c = w.current || {};
  return {
    tempF: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    windMph: c.wind_speed_10m,
    windDirDeg: c.wind_direction_10m,
    pressureHpa: c.surface_pressure,
    weatherCode: c.weather_code,
    elevationM: Array.isArray(e.elevation) ? e.elevation[0] : e.elevation,
    observedAt: c.time,
  };
}

// Public Overpass instances are frequently overloaded (502/504/429); try a few.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
async function overpass(ql) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    try {
      return await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(ql),
      });
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All Overpass mirrors failed');
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => (deg == null ? null : DIRS[Math.round(deg / 22.5) % 16]);

// Golf carry adjustment from altitude and temperature, relative to a sea-level,
// 70°F baseline. These are widely used rules of thumb (estimates, not a physics
// sim): ~2% carry per 1000 ft of altitude, ~1% per 10°F above/below 70°F.
function carryAdjustment({ elevationM, tempF }) {
  const elevationFt = elevationM != null ? elevationM * 3.28084 : 0;
  const altitudePct = (elevationFt / 1000) * 2.0;
  const tempPct = tempF != null ? ((tempF - 70) / 10) * 1.0 : 0;
  const totalPct = altitudePct + tempPct;
  const factor = 1 + totalPct / 100;
  return {
    altitudePct: round1(altitudePct),
    tempPct: round1(tempPct),
    totalPct: round1(totalPct),
    factor: round3(factor),
    elevationFt: Math.round(elevationFt),
    // "A normal 150-yard shot plays like..."
    playsLike150: Math.round(150 * factor),
    note: 'Estimate: ~2% carry per 1000 ft altitude, ~1% per 10°F vs a sea-level 70°F baseline. Does not account for wind, humidity or spin.',
  };
}
const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;

// --- routes ---
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ai-caddie-api', time: new Date().toISOString() }));

app.get('/api/geocode', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'q (query) is required' });
    res.json({ query: q, results: await geocode(q, Math.min(+req.query.limit || 5, 20)) });
  } catch (e) { next(e); }
});

app.get('/api/weather', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: 'lat and lon are required' });
    const w = await weather(lat, lon);
    res.json({ lat, lon, ...w, windFrom: compass(w.windDirDeg) });
  } catch (e) { next(e); }
});

app.get('/api/conditions', async (req, res, next) => {
  try {
    let lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon), place = null;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      const q = (req.query.q || '').toString().trim();
      if (!q) return res.status(400).json({ error: 'provide q (place name) or lat & lon' });
      const hits = await geocode(q, 1);
      if (!hits.length) return res.status(404).json({ error: `No location found for "${q}"` });
      ({ lat, lon } = hits[0]); place = hits[0].name;
    }
    const w = await weather(lat, lon);
    res.json({
      location: { name: place, lat, lon },
      weather: { ...w, windFrom: compass(w.windDirDeg) },
      adjustment: carryAdjustment(w),
    });
  } catch (e) { next(e); }
});

// Golf features near a point or place name, via Overpass.
app.get('/api/course', async (req, res, next) => {
  try {
    let lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    const radius = Math.min(+req.query.radius || 1500, 5000);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      const q = (req.query.q || '').toString().trim();
      if (!q) return res.status(400).json({ error: 'provide q (place name) or lat & lon' });
      const hits = await geocode(q, 1);
      if (!hits.length) return res.status(404).json({ error: `No location found for "${q}"` });
      ({ lat, lon } = hits[0]);
    }
    const ql = `[out:json][timeout:25];(
      way["golf"](around:${radius},${lat},${lon});
      relation["golf"](around:${radius},${lat},${lon});
    );out geom;`;
    const data = await cached(`ov:${lat.toFixed(4)},${lon.toFixed(4)},${radius}`, 6 * 3600e3, () =>
      overpass(ql),
    );
    const features = (data.elements || []).reduce((m, el) => {
      const kind = el.tags?.golf || 'other';
      m[kind] = (m[kind] || 0) + 1;
      return m;
    }, {});
    res.json({ center: { lat, lon }, radius, count: (data.elements || []).length, byType: features, elements: data.elements || [] });
  } catch (e) { next(e); }
});

// Serve the built static app (dist/) when present, so `node server` can host
// the whole thing in production.
const distDir = join(__dirname, '..', 'dist');
app.use(express.static(distDir));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`[api] AI Caddie API on http://localhost:${PORT}`));
