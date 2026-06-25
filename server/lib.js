// Shared API core — used by both the local Express dev server (server/index.js)
// and the Vercel serverless functions (api/*.js). Framework-agnostic: handlers
// take Node-style (req, res) and use only req.query + the send()/cors() helpers,
// so the exact same code runs under Express and under Vercel.
//
// Keyless: uses the free Open-Meteo and OpenStreetMap endpoints (no tokens).

// Route outbound fetch through a proxy when one is configured (corporate
// networks, sandboxed CI/dev). No-op in normal cloud runtimes like Vercel.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
  } catch {
    console.warn('[api] HTTPS_PROXY set but undici unavailable; using direct fetch');
  }
}

const UA = 'AI-Caddie/1.0 (https://github.com/sonnejack/AI_Caddie)';

// --- response helpers (work for both Express res and Vercel res) ---
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
export function send(res, status, obj, cacheSeconds = 0) {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  if (cacheSeconds > 0) res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate`);
  res.end(JSON.stringify(obj));
}
// Wrap a handler with shared error handling + OPTIONS preflight.
export function handler(fn) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
    try {
      await fn(req, res);
    } catch (e) {
      console.error('[api]', e.message);
      send(res, e.status || 500, { error: e.message });
    }
  };
}
// Read query params portably (Express & Vercel both expose req.query; fall back to URL).
export function q(req, key) {
  if (req.query && key in req.query) return req.query[key];
  try { return new URL(req.url, 'http://x').searchParams.get(key) ?? undefined; } catch { return undefined; }
}

// --- tiny TTL cache (upstreams are slow & rate-limited) ---
const cache = new Map();
function cached(key, ttlMs, producer) {
  const hit = cache.get(key), now = Date.now();
  if (hit && now - hit.t < ttlMs) return Promise.resolve(hit.v);
  return Promise.resolve(producer()).then((v) => { cache.set(key, { t: now, v }); return v; });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Upstream ${res.status} for ${url.slice(0, 60)}: ${text.slice(0, 160)}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

// --- geocoding (Nominatim) ---
export async function geocode(query, limit = 5) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(query)}`;
  const data = await cached(`geo:${limit}:${query.toLowerCase()}`, 24 * 3600e3, () => fetchJson(url));
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
export async function weather(lat, lon) {
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
    windFrom: compass(c.wind_direction_10m),
  };
}

// --- golf features (Overpass, with mirror fallback) ---
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
export async function overpass(ql) {
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
export async function courseFeatures(lat, lon, radius) {
  const r = Math.min(radius || 1500, 5000);
  const ql = `[out:json][timeout:25];(
    way["golf"](around:${r},${lat},${lon});
    relation["golf"](around:${r},${lat},${lon});
  );out geom;`;
  const data = await cached(`ov:${lat.toFixed(4)},${lon.toFixed(4)},${r}`, 6 * 3600e3, () => overpass(ql));
  const byType = (data.elements || []).reduce((m, el) => {
    const kind = el.tags?.golf || 'other';
    m[kind] = (m[kind] || 0) + 1;
    return m;
  }, {});
  return { center: { lat, lon }, radius: r, count: (data.elements || []).length, byType, elements: data.elements || [] };
}

// --- helpers ---
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => (deg == null ? null : DIRS[Math.round(deg / 22.5) % 16]);
const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;

// Golf carry adjustment from altitude and temperature, relative to a sea-level,
// 70°F baseline. Widely used rules of thumb (estimates, not a physics sim):
// ~2% carry per 1000 ft altitude, ~1% per 10°F above/below 70°F.
export function carryAdjustment({ elevationM, tempF }) {
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
    playsLike150: Math.round(150 * factor),
    note: 'Estimate: ~2% carry per 1000 ft altitude, ~1% per 10°F vs a sea-level 70°F baseline. Does not account for wind, humidity or spin.',
  };
}

// Resolve a {q} or {lat,lon} input to coordinates (+ resolved place name).
export async function resolveLocation(req) {
  let lat = parseFloat(q(req, 'lat')), lon = parseFloat(q(req, 'lon'));
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon, name: null };
  const query = (q(req, 'q') || '').toString().trim();
  if (!query) { const e = new Error('provide q (place name) or lat & lon'); e.status = 400; throw e; }
  const hits = await geocode(query, 1);
  if (!hits.length) { const e = new Error(`No location found for "${query}"`); e.status = 404; throw e; }
  return { lat: hits[0].lat, lon: hits[0].lon, name: hits[0].name };
}
