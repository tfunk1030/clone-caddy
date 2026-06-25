// AI Caddie — app shell.
// The four golf tools are full standalone HTML documents served from /public.
// We embed them in iframes (each boots its own Cesium/canvas context) and add a
// unified navigation shell, shared course display, and a Cesium token setting on
// top — none of which existed in the original collection of loose HTML files.

// Base path so the same build works at the domain root (Vercel) or under a
// sub-path (GitHub Pages project sites serve from /<repo>/). Vite injects this.
const BASE = import.meta.env.BASE_URL; // always ends with '/'

const VIEWS = {
  home: { title: 'Home' },
  play: { title: 'Play — Course Map', src: `${BASE}play_tab.html` },
  prepare: { title: 'Prepare — Course Study', src: `${BASE}prepare_tab.html` },
  dispersion: { title: 'Dispersion — Shot Pattern', src: `${BASE}dispersion_tab.html` },
  stats: { title: 'Stats — Skill Profiles', src: `${BASE}stats_tab.html` },
};

const app = document.getElementById('app');
const viewTitle = document.getElementById('viewTitle');
const loadedFrames = new Set();

function viewFromHash() {
  const key = (location.hash || '#home').slice(1);
  return VIEWS[key] ? key : 'home';
}

function mountFrame(key) {
  if (loadedFrames.has(key) || !VIEWS[key].src) return;
  const host = document.getElementById(`view-${key}`);
  const frame = document.createElement('iframe');
  frame.title = VIEWS[key].title;
  frame.src = VIEWS[key].src;
  // Allow geolocation (Play uses GPS) and clipboard within the embedded tools.
  frame.allow = 'geolocation; clipboard-read; clipboard-write; fullscreen';
  host.appendChild(frame);
  loadedFrames.add(key);
}

function showView(key) {
  // Toggle views
  document.querySelectorAll('.view').forEach((el) => {
    el.hidden = el.id !== `view-${key}`;
  });
  // Lazy-mount the tab's iframe the first time it is opened.
  mountFrame(key);
  // Nav active state
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === key);
  });
  viewTitle.textContent = VIEWS[key].title;
  document.title = key === 'home' ? 'AI Caddie' : `AI Caddie · ${VIEWS[key].title}`;
  app.classList.remove('nav-open'); // close mobile drawer on navigate
  if (key === 'home') refreshCourse();
}

function navigate(key) {
  if (location.hash.slice(1) === key) showView(key);
  else location.hash = key; // triggers hashchange -> showView
}

window.addEventListener('hashchange', () => showView(viewFromHash()));

// data-go shortcuts (hero buttons, cards, links)
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    e.preventDefault();
    navigate(go.dataset.go);
  }
});

// Keyboard shortcuts 1..5 (ignored while typing in an input/iframe)
const ORDER = ['home', 'play', 'prepare', 'dispersion', 'stats'];
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IFRAME') return;
  const idx = Number(e.key) - 1;
  if (idx >= 0 && idx < ORDER.length) navigate(ORDER[idx]);
});

// --- Selected course display (shared via localStorage across all tabs) ---
const courseChip = document.getElementById('courseChip');
const courseChipName = document.getElementById('courseChipName');
const homeCourseName = document.getElementById('homeCourseName');

function refreshCourse() {
  let name = '';
  try { name = localStorage.getItem('selectedCourseName') || ''; } catch (_) {}
  const has = !!name;
  courseChip.classList.toggle('has-course', has);
  courseChipName.textContent = has ? name : 'No course selected';
  if (homeCourseName) homeCourseName.textContent = has ? name : 'None yet';
}
window.addEventListener('storage', (e) => {
  if (e.key === 'selectedCourseName' || e.key === 'selectedCourse') refreshCourse();
});

// --- Playing conditions (AI Caddie API) ---
const condForm = document.getElementById('conditionsForm');
const condQuery = document.getElementById('conditionsQuery');
const condResult = document.getElementById('conditionsResult');
const condMsg = document.getElementById('conditionsMsg');

// Prefill with the selected course name when available.
try {
  const c = localStorage.getItem('selectedCourseName');
  if (c && condQuery) condQuery.value = c;
} catch (_) {}

const wmoText = (code) => {
  const map = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 61: 'Light rain',
    63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 80: 'Showers', 95: 'Thunderstorm',
  };
  return map[code] || '—';
};

// Carry adjustment (mirrors server/lib.js) for the static fallback path.
function carryAdjustment(elevationM, tempF) {
  const elevationFt = elevationM != null ? elevationM * 3.28084 : 0;
  const altitudePct = (elevationFt / 1000) * 2.0;
  const tempPct = tempF != null ? ((tempF - 70) / 10) * 1.0 : 0;
  const totalPct = altitudePct + tempPct;
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    altitudePct: r1(altitudePct), tempPct: r1(tempPct), totalPct: r1(totalPct),
    elevationFt: Math.round(elevationFt), playsLike150: Math.round(150 * (1 + totalPct / 100)),
    note: 'Estimate: ~2% carry per 1000 ft altitude, ~1% per 10°F vs a sea-level 70°F baseline. Does not account for wind, humidity or spin.',
  };
}
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => (deg == null ? null : DIRS[Math.round(deg / 22.5) % 16]);

// Fallback used when no AI Caddie backend is present (e.g. a static-only host
// like GitHub Pages). Calls the same free public services directly.
async function conditionsDirect(q) {
  const g = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`).then((r) => r.json());
  if (!g.length) throw new Error(`No location found for "${q}"`);
  const lat = parseFloat(g[0].lat), lon = parseFloat(g[0].lon);
  const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const eUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  const [w, e] = await Promise.all([fetch(wUrl).then((r) => r.json()), fetch(eUrl).then((r) => r.json())]);
  const c = w.current || {};
  const elevationM = Array.isArray(e.elevation) ? e.elevation[0] : e.elevation;
  return {
    location: { name: g[0].display_name, lat, lon },
    weather: {
      tempF: c.temperature_2m, humidityPct: c.relative_humidity_2m, windMph: c.wind_speed_10m,
      windDirDeg: c.wind_direction_10m, weatherCode: c.weather_code, windFrom: compass(c.wind_direction_10m),
    },
    adjustment: carryAdjustment(elevationM, c.temperature_2m),
  };
}

async function checkConditions(q) {
  if (!q) { condMsg.textContent = 'Enter a course or city first.'; return; }
  condMsg.textContent = 'Fetching live conditions…';
  condResult.hidden = true;
  try {
    let data;
    // Prefer the optimized backend; fall back to direct public APIs on a
    // static-only host (no /api routes).
    try {
      const r = await fetch(`/api/conditions?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `API ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error('no backend');
      data = await r.json();
    } catch (_) {
      data = await conditionsDirect(q);
    }
    const { location, weather, adjustment } = data;
    const sign = adjustment.totalPct >= 0 ? '+' : '';
    condResult.innerHTML = `
      <p class="cond-loc">📍 ${location.name || `${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`}</p>
      <div class="cond-grid">
        <div class="cond-metric"><div class="k">Temp</div><div class="v">${fmt(weather.tempF, '°F')}</div></div>
        <div class="cond-metric"><div class="k">Wind</div><div class="v">${fmt(weather.windMph, ' mph')}</div><div class="k">${weather.windFrom || ''}</div></div>
        <div class="cond-metric"><div class="k">Humidity</div><div class="v">${fmt(weather.humidityPct, '%')}</div></div>
        <div class="cond-metric"><div class="k">Elevation</div><div class="v">${adjustment.elevationFt.toLocaleString()} ft</div></div>
        <div class="cond-metric"><div class="k">Sky</div><div class="v" style="font-size:15px">${wmoText(weather.weatherCode)}</div></div>
      </div>
      <div class="cond-adjust">
        <div>Carry adjustment <strong>${sign}${adjustment.totalPct}%</strong>
          <span class="muted">(altitude ${adjustment.altitudePct >= 0 ? '+' : ''}${adjustment.altitudePct}%, temp ${adjustment.tempPct >= 0 ? '+' : ''}${adjustment.tempPct}%)</span></div>
        <div class="big">A 150 yd shot plays like ${adjustment.playsLike150} yd</div>
        <div class="muted small">${adjustment.note}</div>
      </div>`;
    condResult.hidden = false;
    condMsg.textContent = '';
  } catch (e) {
    condMsg.textContent = `Could not load conditions: ${e.message}.`;
  }
}
const fmt = (v, unit) => (v == null ? '—' : `${Math.round(v)}${unit}`);

condForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  checkConditions(condQuery.value.trim());
});

// --- Mobile nav toggle ---
document.getElementById('menuBtn').addEventListener('click', () => {
  app.classList.toggle('nav-open');
});

// --- Settings modal (Cesium Ion token) ---
const modal = document.getElementById('settingsModal');
const tokenInput = document.getElementById('ionToken');
const settingsHint = document.getElementById('settingsHint');

function openSettings() {
  try { tokenInput.value = localStorage.getItem('cesiumIonToken') || ''; } catch (_) {}
  settingsHint.textContent = '';
  modal.hidden = false;
  tokenInput.focus();
}
function closeSettings() { modal.hidden = true; }

document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('openSettingsLink')?.addEventListener('click', openSettings);
document.getElementById('settingsCancel').addEventListener('click', closeSettings);
modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
document.getElementById('settingsSave').addEventListener('click', () => {
  const val = tokenInput.value.trim();
  try {
    if (val) localStorage.setItem('cesiumIonToken', val);
    else localStorage.removeItem('cesiumIonToken');
  } catch (_) {}
  settingsHint.textContent = 'Saved. Reloading map tabs…';
  // Reload any already-mounted Cesium tabs so the new token takes effect.
  ['play', 'prepare'].forEach((key) => {
    const host = document.getElementById(`view-${key}`);
    const frame = host && host.querySelector('iframe');
    if (frame) frame.contentWindow.location.reload();
  });
  setTimeout(closeSettings, 700);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });

// --- Boot ---
refreshCourse();
showView(viewFromHash());
// Keep the chip fresh when returning to the tab (storage events don't fire in
// the same document that wrote them).
setInterval(refreshCourse, 2000);
