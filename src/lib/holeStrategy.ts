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

// Approach heading (radians) for a hole — tee end of the centerline -> green.
export function approachHeading(hole: Hole): number {
  if (!hole.green) return 0;
  const green = { lat: hole.green.lat, lon: hole.green.lon };
  const start = hole.path.length ? { lon: hole.path[0][0], lat: hole.path[0][1] } : green;
  return bearing(start, green);
}

// Approach-frame offset (yards, x=right/y=long) of a lon/lat relative to a center.
export function lonLatToOffset(center: { lat: number; lon: number }, lonlat: [number, number], θ: number) {
  return toApproachFrame(center, { lon: lonlat[0], lat: lonlat[1] }, θ);
}

// Inverse: an approach-frame offset (yards) back to [lon, lat].
export function offsetToLonLat(center: { lat: number; lon: number }, offset: { x: number; y: number }, θ): [number, number] {
  const eastYd = offset.x * Math.cos(θ) + offset.y * Math.sin(θ);
  const northYd = -offset.x * Math.sin(θ) + offset.y * Math.cos(θ);
  const eastM = eastYd / M_TO_YD, northM = northYd / M_TO_YD;
  const dLat = northM / 111320;
  const dLon = eastM / (111320 * Math.cos(toRad(center.lat)));
  return [center.lon + dLon, center.lat + dLat];
}

export type HoleStrategy = {
  model: GreenModel;
  bunkers: number;
  water: 'L' | 'R' | 'long' | 'short' | null;
  heading: number;
};

// pinOffset is the pin's position relative to the green centroid, in the
// approach frame (x = right, y = long), in yards. {0,0} = pin at centroid.
export function buildHoleModel(hole: Hole, elements: El[], pinOffset = { x: 0, y: 0 }): HoleStrategy | null {
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

  // Closest greenside water hazard (kept in green-centroid frame for now).
  let waterHit: { x: number; y: number; r: number } | null = null;
  for (const e of elements) {
    const g = e.tags?.golf;
    if (g !== 'water_hazard' && g !== 'lateral_water_hazard') continue;
    const w = near(e.geometry, 35);
    if (!w) continue;
    if (!waterHit || Math.hypot(w.x, w.y) < Math.hypot(waterHit.x, waterHit.y)) waterHit = w;
  }

  // Shift everything from the green-centroid frame into the pin frame (pin at
  // origin) by subtracting the pin offset.
  const shift = (p: { x: number; y: number; r: number }) => ({ x: p.x - pinOffset.x, y: p.y - pinOffset.y, r: p.r });
  let water: GreenModel['water'] = null;
  let waterSide: HoleStrategy['water'] = null;
  if (waterHit) {
    const w = shift(waterHit);
    const horizontal = Math.abs(w.x) >= Math.abs(w.y);
    waterSide = horizontal ? (w.x > 0 ? 'R' : 'L') : w.y > 0 ? 'long' : 'short';
    water = { side: waterSide, line: Math.max(2, Math.abs(horizontal ? w.x : w.y) - w.r) };
  }

  const model: GreenModel = {
    greenRadius: hole.green.radiusYds,
    greenCenter: { x: -pinOffset.x, y: -pinOffset.y }, // green centroid seen from the pin
    bunker: bunkerHit ? shift(bunkerHit) : null,
    water,
    penaltyStrokes: 1,
  };
  return { model, bunkers: bunkerCount, water: waterSide, heading: θ };
}
