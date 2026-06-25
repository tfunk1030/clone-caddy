// Tee-shot strategy: evaluate candidate tee shots down a hole and pick three
// lines — aggressive (longest, closest to the green), optimal (lowest expected
// strokes), and conservative (safest). Each candidate is a target distance down
// the centerline; we Monte-Carlo the tee dispersion, classify each landing
// against the hole's real OSM polygons (fairway/bunker/water/green), look up
// expected strokes to hole out from there, and average.

import { haversine, type Hole } from './holes';
import { expectedStrokes } from './expectedStrokes';
import { offsetToLonLat } from './holeStrategy';
import { makeSamples } from './shotModel';

type Geom = { lat: number; lon: number }[];
type El = {
  type: string;
  tags?: Record<string, string>;
  geometry?: Geom;
  members?: { type: string; role?: string; geometry?: Geom }[];
};
type LL = [number, number]; // [lon, lat]

// Rings for an element: a way's own geometry, or a relation's outer-member ways
// (golf fairways/greens are frequently mapped as multipolygon relations).
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
const M_TO_YD = 1.09361;
const toRad = (d: number) => (d * Math.PI) / 180;

// Ray-casting point-in-polygon. ring: [lon,lat][].
function pointInRing([x, y]: LL, ring: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Polys = { water: LL[][]; sand: LL[][]; green: LL[][]; fairway: LL[][] };
function buildPolys(elements: El[]): Polys {
  const out: Polys = { water: [], sand: [], green: [], fairway: [] };
  for (const e of elements) {
    const k = e.tags?.golf;
    const bucket =
      k === 'water_hazard' || k === 'lateral_water_hazard' ? out.water
      : k === 'bunker' ? out.sand
      : k === 'green' ? out.green
      : k === 'fairway' ? out.fairway
      : null;
    if (!bucket) continue;
    for (const ring of elementRings(e)) bucket.push(ring);
  }
  return out;
}

type Lie = 'water' | 'sand' | 'green' | 'fairway' | 'rough';
function classifyLanding(p: LL, polys: Polys): Lie {
  if (polys.water.some((r) => pointInRing(p, r))) return 'water';
  if (polys.sand.some((r) => pointInRing(p, r))) return 'sand';
  if (polys.green.some((r) => pointInRing(p, r))) return 'green';
  if (polys.fairway.some((r) => pointInRing(p, r))) return 'fairway';
  return 'rough';
}

// Walk `distYd` along the centerline from the tee; return the point + local heading.
function walkAlong(path: LL[], distYd: number): { pt: LL; heading: number } {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = { lon: path[i - 1][0], lat: path[i - 1][1] };
    const b = { lon: path[i][0], lat: path[i][1] };
    const segYd = haversine(a, b) * M_TO_YD;
    if (acc + segYd >= distYd) {
      const t = segYd === 0 ? 0 : (distYd - acc) / segYd;
      const pt: LL = [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
      const heading = Math.atan2(
        Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat)),
        Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon)),
      );
      return { pt, heading };
    }
    acc += segYd;
  }
  const a = { lon: path[path.length - 2]?.[0] ?? path[0][0], lat: path[path.length - 2]?.[1] ?? path[0][1] };
  const b = { lon: path[path.length - 1][0], lat: path[path.length - 1][1] };
  const heading = Math.atan2(
    Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat)),
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon)),
  );
  return { pt: path[path.length - 1], heading };
}

export type TeeLine = {
  label: 'Aggressive' | 'Optimal' | 'Conservative';
  carry: number;            // yards down the line
  target: LL;               // landing point [lon,lat]
  es: number;               // expected strokes to hole out (incl. the tee shot)
  remainingYds: number;     // mean distance left to the green
  breakdown: Record<Lie, number>;
};

function strokesFromLie(lie: Lie, distToGreenYd: number): number {
  if (lie === 'green') return expectedStrokes('green', Math.min(distToGreenYd, 60) * 3);
  if (lie === 'water') return 1 + expectedStrokes('rough', distToGreenYd);
  const map: Record<Lie, any> = { fairway: 'fairway', rough: 'rough', sand: 'sand', green: 'green', water: 'rough' };
  return expectedStrokes(map[lie], distToGreenYd);
}

export function teeStrategies(hole: Hole, elements: El[], drivingDistance: number): { lines: TeeLine[] } | null {
  if (!hole.green || hole.path.length < 2 || hole.yards < 120) return null;
  const polys = buildPolys(elements);
  const green = { lon: hole.green.lon, lat: hole.green.lat };
  const maxCarry = Math.min(drivingDistance || 260, hole.yards - 8);
  const samples = makeSamples(160);

  const cands = [] as Array<Omit<TeeLine, 'label'> & { trouble: number }>;
  for (let c = 150; c <= maxCarry; c += 10) {
    const { pt, heading } = walkAlong(hole.path, c);
    const offSD = c * 0.06, depthSD = c * 0.035; // dispersion grows with club length
    let total = 0, rem = 0;
    const cnt: Record<Lie, number> = { water: 0, sand: 0, green: 0, fairway: 0, rough: 0 };
    for (const s of samples) {
      const land = offsetToLonLat({ lon: pt[0], lat: pt[1] }, { x: s.zx * offSD, y: s.zy * depthSD }, heading);
      const lie = classifyLanding(land, polys);
      cnt[lie]++;
      const dist = haversine({ lon: land[0], lat: land[1] }, green) * M_TO_YD;
      rem += dist;
      total += 1 + strokesFromLie(lie, dist); // +1 for the tee shot
    }
    const n = samples.length;
    cands.push({
      carry: c, target: pt, es: total / n, remainingYds: rem / n,
      trouble: (cnt.sand + cnt.water) / n,
      breakdown: { water: cnt.water / n, sand: cnt.sand / n, green: cnt.green / n, fairway: cnt.fairway / n, rough: cnt.rough / n },
    });
  }
  if (!cands.length) return null;

  const optimal = cands.reduce((a, b) => (b.es < a.es ? b : a));
  const aggressive = cands.reduce((a, b) => (b.remainingYds < a.remainingYds ? b : a)); // closest to green
  // Conservative = safest play, but only laying back up to ~80 yd (a club or two
  // down, not a wedge off the tee). Tie-break to the shorter, safer carry.
  const safeSet = cands.filter((c) => c.carry >= maxCarry - 80);
  const conservative = (safeSet.length ? safeSet : cands).reduce((a, b) =>
    b.trouble < a.trouble - 0.005 || (Math.abs(b.trouble - a.trouble) <= 0.005 && b.carry < a.carry) ? b : a);

  const mk = (c: typeof optimal, label: TeeLine['label']): TeeLine => ({
    label, carry: c.carry, target: c.target, es: c.es, remainingYds: Math.round(c.remainingYds), breakdown: c.breakdown,
  });
  return { lines: [mk(aggressive, 'Aggressive'), mk(optimal, 'Optimal'), mk(conservative, 'Conservative')] };
}
