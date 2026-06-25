# ⛳ AI Caddie

A golf shot-planning and performance web app. AI Caddie helps you pick a course,
study it in 3D, plan shots around your **real** shot dispersion, and track
**strokes gained** against tour benchmarks.

This is a fully buildable, unified version of the original
[`sonnejack/AI_Caddie`](https://github.com/sonnejack/AI_Caddie) research project,
which shipped as four loose, standalone HTML files with broken asset paths and no
way to navigate between them. See [What changed](#what-changed) below.

---

## Features

| Tab | What it does |
| --- | --- |
| 🗺️ **Play** | 3D Cesium course flyover with terrain, OSM hazards/greens and live shot-dispersion overlays to find the smartest aim point. |
| 🎯 **Prepare** | Pre-round course study with short-game modifiers and lie-by-lie expected outcomes. |
| 📈 **Dispersion** | Scatter your shots and fit a tight minimum-volume enclosing ellipse (MVEE) to quantify your pattern. |
| 📊 **Stats** | Player skill profiles with strokes-gained radar charts benchmarked against tour data. |

Plus a unified app shell with:

- **Sidebar navigation** + keyboard shortcuts (<kbd>1</kbd>–<kbd>5</kbd>) — the original had no navigation at all.
- **Shared course selection** that follows you across every tab (via `localStorage`).
- A **Settings panel** to plug in your own **Cesium Ion token** (the original hardcoded and duplicated one token).
- A **home dashboard** and responsive/mobile layout.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for production and preview:

```bash
npm run build      # -> dist/
npm run preview    # serve the production build on http://localhost:4173
```

Validate the project structure (also run in CI):

```bash
npm run lint
```

> **Cesium Ion token** — the Play and Prepare 3D maps need a Cesium Ion token for
> terrain and imagery. A default token is bundled, but it may be rate-limited or
> expired. Get a free token at <https://ion.cesium.com/tokens> and paste it into
> **Settings** in the app (stored locally in your browser).

---

## Project structure

```
.
├── index.html                 # Unified app shell (Vite entry)
├── src/
│   ├── main.js                # Shell: routing, nav, settings, shared course state
│   └── style.css              # Shell styling
├── public/                    # Served verbatim
│   ├── play_tab.html          # The four standalone golf tools (embedded as iframes)
│   ├── prepare_tab.html
│   ├── dispersion_tab.html
│   ├── stats_tab.html
│   └── dependencies/          # Assets the tabs load at runtime
│       ├── js/                #   performanceManager, courseDataManager, etc.
│       ├── short_game_modifiers.json
│       └── *.csv
├── scripts/check-structure.mjs
├── research/                  # Original Python physics model + data collection (not part of the web app)
└── vite.config.js
```

Each tab is a self-contained document that boots its own Cesium/canvas context, so
the shell embeds them in `iframe`s rather than merging them — this keeps their
independent global scopes and multiple map viewers from colliding. They
communicate through `localStorage` (e.g. the selected course), which the shell
reads to keep the header in sync.

---

## Research

The `research/` folder preserves the original analysis work that powers the app's
assumptions: iterative ballistic **physics models** (`research/Physics_Model/`),
**FlightScope/Trackman data collection** scripts and datasets, and the product
docs (`research/General/`). These are Python scripts and are **not** part of the
web build.

---

## What changed

Compared to the upstream snapshot, this version:

1. **Actually runs.** Fixed the broken `./dependencies/...` paths so the tabs load their JS modules and data.
2. **Added a build system** (Vite) with `dev`, `build`, `preview`, and `lint` scripts.
3. **Added a unified SPA shell** with sidebar navigation, a home dashboard, keyboard shortcuts and a responsive layout — previously each tab was an isolated page with no way to get between them.
4. **Made the Cesium Ion token configurable** via a Settings panel instead of a hardcoded, duplicated literal.
5. **Surfaced the shared course selection** in the header so you always know which course is active.
6. **Organized the repo**: web app vs. `research/`, plus a structure-check script and CI.

---

## License

Inherits the licensing of the upstream project. Course data is fetched live from
OpenStreetMap (Overpass) and Nominatim; 3D terrain/imagery from Cesium Ion.
