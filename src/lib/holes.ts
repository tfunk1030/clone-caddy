// Derive a hole list from OSM "golf" features (the elements returned by /api/course).
//
// Courses are usually mapped with golf=hole centerline ways (tagged with ref =
// hole number and often par), plus golf=green / golf=tee polygons. We build a
// sorted hole list with length (yards), par, the centerline path, and the green
// centroid + radius — enough to drive navigation and feed the ES model.

type El = { type: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

const R = 6371000; // earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const M_TO_YD = 1.09361;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function pathLengthM(geom: { lat: number; lon: number }[]): number {
  let m = 0;
  for (let i = 1; i < geom.length; i++) m += haversine(geom[i - 1], geom[i]);
  return m;
}

function centroid(geom: { lat: number; lon: number }[]) {
  const lat = geom.reduce((s, p) => s + p.lat, 0) / geom.length;
  const lon = geom.reduce((s, p) => s + p.lon, 0) / geom.length;
  return { lat, lon };
}

// Largest distance from centroid to any vertex → an approximate green "radius".
function radiusYds(geom: { lat: number; lon: number }[], c: { lat: number; lon: number }): number {
  return Math.max(...geom.map((p) => haversine(p, c))) * M_TO_YD;
}

export type Hole = {
  number: number;
  par: number | null;
  yards: number;
  path: [number, number][];        // [lon, lat]
  green: { lon: number; lat: number; radiusYds: number } | null;
};

export function extractHoles(elements: El[]): Hole[] {
  const greens = elements
    .filter((e) => e.tags?.golf === 'green' && e.geometry && e.geometry.length >= 3)
    .map((e) => ({ c: centroid(e.geometry!), r: radiusYds(e.geometry!, centroid(e.geometry!)) }));

  const holeWays = elements.filter((e) => e.tags?.golf === 'hole' && e.geometry && e.geometry.length >= 2);

  const holes: Hole[] = holeWays.map((e, i) => {
    const geom = e.geometry!;
    const num = parseInt(e.tags?.ref || '', 10);
    const par = e.tags?.par ? parseInt(e.tags.par, 10) : null;
    // Green nearest the hole's end point.
    const end = geom[geom.length - 1];
    let green: Hole['green'] = null;
    if (greens.length) {
      let best = greens[0], bestD = Infinity;
      for (const g of greens) {
        const d = haversine(g.c, end);
        if (d < bestD) { bestD = d; best = g; }
      }
      green = { lon: best.c.lon, lat: best.c.lat, radiusYds: Math.round(best.r) };
    }
    return {
      number: Number.isFinite(num) ? num : i + 1,
      par: par && par >= 3 && par <= 6 ? par : null,
      yards: Math.round(pathLengthM(geom) * M_TO_YD),
      path: geom.map((p) => [p.lon, p.lat] as [number, number]),
      green,
    };
  });

  return holes.sort((a, b) => a.number - b.number);
}

export function courseSummary(holes: Hole[]) {
  const pars = holes.map((h) => h.par).filter((p): p is number => p != null);
  const totalPar = pars.reduce((s, p) => s + p, 0);
  const totalYds = holes.reduce((s, h) => s + h.yards, 0);
  return { holeCount: holes.length, totalPar: totalPar || null, totalYds };
}
