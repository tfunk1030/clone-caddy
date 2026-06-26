// Geo-space Expected-Strokes evaluation for the unified Prepare map.
//
// Unlike the green-frame model in shotModel.ts (idealized circles / half-planes),
// this evaluates an aim against the hole's REAL OSM polygons: it samples landing
// points around an aim, classifies each against fairway / green / bunker / water
// rings, looks up strokes-to-hole-out from the landing to the pin, and reduces
// to the three CADD-AI strategies (optimal / aggressive / safe). This is what
// drives tapping anywhere on the map to get a live Expected-Strokes target.

import { expectedStrokesAt, type Division, type ShortGame } from './expectedStrokes';
import { makeSamples, type Strategy } from './shotModel';

export type LL = [number, number]; // [lon, lat]
type Geom = { lat: number; lon: number }[];
type El = {
  type: string;
  tags?: Record<string, string>;
  geometry?: Geom;
  members?: { type: string; role?: string; geometry?: Geom }[];
};

const YD_PER_M = 1.09361;
const M_PER_YD = 0.9144;
const toRad = (d: number) => (d * Math.PI) / 180;

// --- polygon extraction (ways + multipolygon relation outers) ---
function elementRings(e: El): LL[][] {
  if (e.type === 'way' && e.geometry && e.geometry.length >= 3) {
    return [e.geometry.map((p) => [p.lon, p.lat] as LL)];
  }
  if (e.type === 'relation' && Array.isArray(e.members)) {
    return e.members
      .filter((m) => m.type === 'way' && (m.role === 'outer' || !m.role) && m.geometry && m.geometry.length >= 3)
      .map((m) => m.geometry!.map((p) => [p.lon, p.lat] as LL));
  }
  return [];
}

export type GeoPolys = { water: LL[][]; sand: LL[][]; green: LL[][]; fairway: LL[][]; tee: LL[][] };

// Build classified rings, keeping only those whose bbox is near `center` (yards)
// so the per-sample point-in-polygon tests stay cheap.
export function buildGeoPolys(elements: El[], center?: { lat: number; lon: number }, withinYd = 450): GeoPolys {
  const out: GeoPolys = { water: [], sand: [], green: [], fairway: [], tee: [] };
  const mPerDegLat = 111320;
  const near = (ring: LL[]) => {
    if (!center) return true;
    const mPerDegLon = 111320 * Math.cos(toRad(center.lat));
    for (const [lon, lat] of ring) {
      const dx = (lon - center.lon) * mPerDegLon, dy = (lat - center.lat) * mPerDegLat;
      if (Math.hypot(dx, dy) * YD_PER_M <= withinYd) return true;
    }
    return false;
  };
  for (const e of elements) {
    const k = e.tags?.golf;
    const bucket =
      k === 'water_hazard' || k === 'lateral_water_hazard' ? out.water
      : k === 'bunker' ? out.sand
      : k === 'green' ? out.green
      : k === 'fairway' ? out.fairway
      : k === 'tee' ? out.tee
      : null;
    if (!bucket) continue;
    for (const ring of elementRings(e)) if (near(ring)) bucket.push(ring);
  }
  return out;
}

function pointInRing([x, y]: LL, ring: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type Lie = 'water' | 'sand' | 'green' | 'fairway' | 'tee' | 'rough';
export function classifyPoint(p: LL, polys: GeoPolys): Lie {
  if (polys.water.some((r) => pointInRing(p, r))) return 'water';
  if (polys.sand.some((r) => pointInRing(p, r))) return 'sand';
  if (polys.green.some((r) => pointInRing(p, r))) return 'green';
  if (polys.fairway.some((r) => pointInRing(p, r))) return 'fairway';
  if (polys.tee.some((r) => pointInRing(p, r))) return 'tee';
  return 'rough';
}

// --- geo helpers ---
export function haversineYd(a: LL, b: LL): number {
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]), la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * YD_PER_M;
}
// Bearing from a→b, radians clockwise from north.
export function bearing(a: LL, b: LL): number {
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(dLon);
  return Math.atan2(y, x);
}
// Move from origin by (forwardYd along bearing, rightYd perpendicular-right).
export function offset(origin: LL, brng: number, forwardYd: number, rightYd: number): LL {
  const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos(toRad(origin[1]));
  const fM = forwardYd * M_PER_YD, rM = rightYd * M_PER_YD;
  const eastM = fM * Math.sin(brng) + rM * Math.cos(brng);
  const northM = fM * Math.cos(brng) - rM * Math.sin(brng);
  return [origin[0] + eastM / mPerDegLon, origin[1] + northM / mPerDegLat];
}

// --- aim evaluation ---
const PENALTY = 1; // water/OB stroke penalty (added on top of the rough lie)
function esFromLie(lie: Lie, distYd: number, division: Division, sg?: ShortGame): number {
  if (lie === 'water') return PENALTY + expectedStrokesAt(distYd, 'rough', division, sg);
  return expectedStrokesAt(distYd, lie, division, sg);
}

export type AimEval = { mean: number; cvar: number; sorted: number[]; breakdown: Record<string, number> };

// Evaluate one aim: sample dispersion around it (oriented along start→aim),
// classify each landing, sum strokes-to-hole-out from the landing to the pin.
export function evaluateAim(
  start: LL, aim: LL, pin: LL, polys: GeoPolys,
  sigmaOffYd: number, sigmaDepthYd: number,
  samples: { zx: number; zy: number }[], division: Division, sg?: ShortGame,
): AimEval {
  const brng = bearing(start, aim);
  const out = new Array<number>(samples.length);
  const counts: Record<string, number> = { green: 0, fairway: 0, tee: 0, rough: 0, sand: 0, water: 0 };
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const land = offset(aim, brng, s.zy * sigmaDepthYd, s.zx * sigmaOffYd);
    const lie = classifyPoint(land, polys);
    counts[lie]++;
    out[i] = 1 + esFromLie(lie, haversineYd(land, pin), division, sg);
  }
  const n = samples.length;
  const mean = out.reduce((a, b) => a + b, 0) / n;
  const sorted = out.slice().sort((a, b) => a - b);
  const breakdown: Record<string, number> = {};
  for (const k of Object.keys(counts)) breakdown[k] = counts[k] / n;
  return { mean, cvar: cvar30(sorted), sorted, breakdown };
}

function cvar30(sortedAsc: number[]): number {
  const k = Math.max(1, Math.ceil(sortedAsc.length * 0.3));
  let s = 0;
  for (let i = sortedAsc.length - k; i < sortedAsc.length; i++) s += sortedAsc[i];
  return s / k;
}
function upside(sorted: number[], N: number): number {
  let s = 0;
  for (const e of sorted) if (e < N) s += N - e;
  return s / sorted.length;
}

export type GeoStrategyAim = {
  strategy: Strategy;
  aim: LL;
  es: number;
  cvar: number;
  breakdown: Record<string, number>;
};
export type GeoOpt = {
  optimal: GeoStrategyAim;
  aggressive: GeoStrategyAim;
  safe: GeoStrategyAim;
  pinES: number;
  ellipse: LL[]; // dispersion ellipse around the focused (optimal) aim
};

// Search an aim grid in the approach frame (origin = pin, forward = start→pin),
// then pick the three CADD-AI strategies. Mirrors shotModel.optimizeStrategies
// but in geo space against the real polygons.
export function optimizeGeo(
  start: LL, pin: LL, polys: GeoPolys,
  sigmaOffYd: number, sigmaDepthYd: number,
  division: Division, sg?: ShortGame, nSamples = 220,
): GeoOpt {
  const samples = makeSamples(nSamples);
  const brng = bearing(start, pin);
  const pinES = evaluateAim(start, pin, pin, polys, sigmaOffYd, sigmaDepthYd, samples, division, sg).mean;

  type Cell = { aim: LL; ev: AimEval };
  const cells: Cell[] = [];
  for (let lat = -24; lat <= 24; lat += 3) {       // lateral yards (right +)
    for (let dep = -18; dep <= 12; dep += 3) {     // depth yards (long +, short −)
      const aim = offset(pin, brng, dep, lat);
      const ev = evaluateAim(start, aim, pin, polys, sigmaOffYd, sigmaDepthYd, samples, division, sg);
      cells.push({ aim, ev });
    }
  }
  let opt = cells[0];
  for (const c of cells) if (c.ev.mean < opt.ev.mean) opt = c;
  const N = opt.ev.mean;
  let agg = cells[0]; let aggS = -Infinity;
  for (const c of cells) { const u = upside(c.ev.sorted, N); if (u > aggS) { aggS = u; agg = c; } }
  let safe = cells[0]; let safeS = Infinity;
  for (const c of cells) { if (c.ev.cvar < safeS) { safeS = c.ev.cvar; safe = c; } }

  const mk = (c: Cell, strategy: Strategy): GeoStrategyAim => ({ strategy, aim: c.aim, es: c.ev.mean, cvar: c.ev.cvar, breakdown: c.ev.breakdown });
  return {
    optimal: mk(opt, 'optimal'), aggressive: mk(agg, 'aggressive'), safe: mk(safe, 'safe'),
    pinES, ellipse: dispersionEllipse(start, opt.aim, sigmaOffYd, sigmaDepthYd),
  };
}

// A ~1.6σ dispersion ellipse (GeoJSON ring) around an aim, oriented along start→aim.
export function dispersionEllipse(start: LL, aim: LL, sigmaOffYd: number, sigmaDepthYd: number, k = 1.6, steps = 48): LL[] {
  const brng = bearing(start, aim);
  const ring: LL[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push(offset(aim, brng, Math.sin(t) * sigmaDepthYd * k, Math.cos(t) * sigmaOffYd * k));
  }
  return ring;
}
