// Build an expected-strokes GreenModel for a real hole by projecting its OSM
// greenside hazards (bunkers, water) into the approach frame — the coordinate
// system the ES model uses (pin at origin, x = right of the approach line,
// y = long/short along it). The pin is assumed at the green centroid (no pin
// sheet), so the optimizer's job here is to bias the aim away from trouble.

import { haversine, type Hole } from './holes';
import type { GreenModel } from './shotModel';

type El = { type: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

const M_TO_YD = 1.09361;
const toRad = (d: number) => (d * Math.PI) / 180;

function centroid(geom: { lat: number; lon: number }[]) {
  return {
    lat: geom.reduce((s, p) => s + p.lat, 0) / geom.length,
    lon: geom.reduce((s, p) => s + p.lon, 0) / geom.length,
  };
}

// Bearing (radians, clockwise from north) from a -> b.
function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

// Local offset (yards) of point p relative to center c, projected into the
// approach frame given heading θ (right = +x, long = +y).
function toApproachFrame(c: { lat: number; lon: number }, p: { lat: number; lon: number }, θ: number) {
  const east = (p.lon - c.lon) * Math.cos(toRad(c.lat)) * 111320 * M_TO_YD;
  const north = (p.lat - c.lat) * 111320 * M_TO_YD;
  return {
    x: east * Math.cos(θ) - north * Math.sin(θ), // right
    y: east * Math.sin(θ) + north * Math.cos(θ), // long
  };
}

export type HoleStrategy = {
  model: GreenModel;
  bunkers: number;
  water: 'L' | 'R' | 'long' | 'short' | null;
  heading: number;
};

export function buildHoleModel(hole: Hole, elements: El[]): HoleStrategy | null {
  if (!hole.green) return null;
  const green = { lat: hole.green.lat, lon: hole.green.lon };
  // Approach heading: from the start of the centerline toward the green.
  const start = hole.path.length ? { lon: hole.path[0][0], lat: hole.path[0][1] } : green;
  const θ = bearing(start, green);

  const near = (geom?: { lat: number; lon: number }[], maxYd = 45) => {
    if (!geom || geom.length < 3) return null;
    const c = centroid(geom);
    const d = haversine(c, green) * M_TO_YD;
    if (d > maxYd) return null;
    const r = Math.max(...geom.map((q) => haversine(q, c))) * M_TO_YD;
    return { ...toApproachFrame(green, c, θ), r: Math.min(Math.max(r, 3), 9) };
  };

  // Closest greenside bunker.
  let bunkerHit: { x: number; y: number; r: number } | null = null;
  let bunkerCount = 0;
  for (const e of elements) {
    if (e.tags?.golf !== 'bunker') continue;
    const b = near(e.geometry, 40);
    if (!b) continue;
    bunkerCount++;
    if (!bunkerHit || Math.hypot(b.x, b.y) < Math.hypot(bunkerHit.x, bunkerHit.y)) bunkerHit = b;
  }

  // Water side (lateral/water hazard near the green).
  let water: GreenModel['water'] = null;
  let waterSide: HoleStrategy['water'] = null;
  for (const e of elements) {
    const g = e.tags?.golf;
    if (g !== 'water_hazard' && g !== 'lateral_water_hazard') continue;
    const w = near(e.geometry, 35);
    if (!w) continue;
    const horizontal = Math.abs(w.x) >= Math.abs(w.y);
    waterSide = horizontal ? (w.x > 0 ? 'R' : 'L') : w.y > 0 ? 'long' : 'short';
    const line = Math.max(2, Math.abs(horizontal ? w.x : w.y) - w.r);
    water = { side: waterSide, line };
    break;
  }

  const model: GreenModel = {
    greenRadius: hole.green.radiusYds,
    greenCenter: { x: 0, y: 0 }, // pin assumed at green centroid
    bunker: bunkerHit,
    water,
    penaltyStrokes: 1,
  };
  return { model, bunkers: bunkerCount, water: waterSide, heading: θ };
}
