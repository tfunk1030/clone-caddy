# ⛳ CADD-AI — Professional Course Analysis

**Smarter golf starts here.** A golf course-strategy app: search any course, map
it in **3D satellite**, study every hole, and let an **expected-strokes engine**
pick the smartest aim point around your real shot dispersion, the pin position,
and the hazards.

🔗 **Live:** https://clone-caddy.vercel.app

> A faithful, from-scratch rebuild of the product at
> [`cadd-ai.vercel.app`](https://cadd-ai.vercel.app) (a React / Mapbox GL /
> Supabase app), reconstructed from its deployed behavior and design. The
> original [`sonnejack/AI_Caddie`](https://github.com/sonnejack/AI_Caddie)
> Cesium prototypes are preserved under [`legacy/`](./legacy).

---

## Features

| Section | What it does |
| --- | --- |
| 🏠 **Overview** | Dashboard with strokes-gained KPIs and strategy presets (Standard, Elite Am, Tiger Five, Tournament, Aggressive, Recovery). |
| 🗺️ **Course** | 3D Mapbox satellite map. Search a course, overlay live OSM golf features (greens/tees/bunkers/fairways), step hole-by-hole, and **drag the pin** to set a pin sheet. |
| 🎯 **Dispersion** | Scatter your shot pattern and tune your two-sigma oval. |
| 🧭 **Expected Strokes** | Monte-Carlo aim optimizer: find the aim that minimizes expected strokes given your dispersion, the green, and the hazards. |
| ⛅ **Conditions** | Green speed / firmness / slope modifiers that feed the scoring model. |
| 💨 **Wind & Forecast** | Live weather + an altitude/temperature **carry adjustment**. |
| 📊 **Rankings** | Benchmark your game vs PGA/LPGA Tour baselines. |
| ⚙️ **Settings** | Theme (dark/light/system) and integration status. |

### The engines under the hood

- **Expected strokes** (`src/lib/expectedStrokes.ts`) — PGA-Tour strokes-to-hole-out baseline (Broadie) by lie and distance.
- **Shot model + aim optimizer** (`src/lib/shotModel.ts`) — variance-reduced Monte-Carlo sampling of your dispersion, landing-point classification against a green/bunker/water model, and a grid search for the lowest-ES aim.
- **Hole extraction** (`src/lib/holes.ts`) — derives hole number, par, yardage, centerline and green from OSM golf features.
- **Per-hole strategy** (`src/lib/holeStrategy.ts`) — projects a hole's real greenside bunkers/water into the approach frame and builds the ES model for the selected pin position.

---

## Tech stack

React 18 + Vite + TypeScript · Tailwind + Radix (shadcn-style UI) · **Mapbox GL**
+ turf-style geometry · Recharts · Supabase-ready auth (demo mode by default) ·
a small **keyless** Node/Express + Vercel-serverless API.

---

## Quick start

```bash
npm install
npm run dev        # web on http://localhost:5173 + API on http://localhost:8787
```

`npm run dev` runs the Vite web server and the API server together (Vite proxies
`/api` → the API). Other scripts: `npm run build`, `npm run preview`,
`npm run lint` (structure check).

### Environment variables

Create a `.env` (git-ignored). All are optional — the app runs without them.

| Var | Enables | Without it |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | 3D satellite course map | Course search, hole list and per-hole strategy still work; the map area shows a setup card |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Real accounts | **Demo auth** (any email signs in; state saved locally) |

> **Auth:** this build runs in **demo mode** by default — any email signs you in
> and your dispersion/pin sheets are stored in your browser. Set the Supabase
> vars to switch on real accounts.

---

## Deploy

Deployed to **Vercel**: the frontend builds to static files and the API runs as
serverless functions in `api/`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftfunk1030%2Fclone-caddy)

```bash
npm i -g vercel
vercel --prod
```

Set `VITE_MAPBOX_TOKEN` in the Vercel project's Environment Variables (Production
+ Preview) so the 3D map renders. `vercel.json` configures the Vite build, the
serverless functions, and the SPA rewrite.

---

## API (keyless)

A small service (`server/lib.js`, exposed as `api/*.js` serverless functions and
a local Express server) using free Open-Meteo + OpenStreetMap endpoints — no API
keys.

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness. |
| `GET /api/geocode?q=` | Course/place search (Nominatim). |
| `GET /api/weather?lat=&lon=` | Temperature, wind, humidity, pressure, elevation (Open-Meteo). |
| `GET /api/conditions?q=` | Weather + elevation **plus a golf carry adjustment**. |
| `GET /api/course?q=` | Golf features near a course via Overpass (mirror fallback). |

---

## Project structure

```
.
├── index.html                 # Vite entry
├── src/
│   ├── main.tsx, App.tsx       # bootstrap + routing
│   ├── components/             # UI kit, AppShell, GreenMap, theme
│   ├── context/                # Auth, Theme, Profile (shared dispersion/pin sheet)
│   ├── lib/                    # expectedStrokes, shotModel, holes, holeStrategy, mapbox, overpass
│   └── pages/                  # Login, Dashboard, Course, Dispersion, ExpectedStrokes, Conditions, Forecast, Rankings, Settings
├── api/                        # Vercel serverless functions
├── server/                     # Shared API core + local Express dev server
├── legacy/                     # The original Cesium AI_Caddie prototypes
└── vercel.json, tailwind.config.js, vite.config.ts
```

---

## Credits

Design and feature set reconstructed from **cadd-ai.vercel.app**. Course data
from OpenStreetMap (Overpass) + Nominatim; weather/elevation from Open-Meteo; 3D
imagery from Mapbox. Strokes-gained baselines after Mark Broadie's *Every Shot
Counts*.
