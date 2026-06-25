// Convert Overpass "out geom" elements (from /api/course) into GeoJSON the map
// can render, tagging each feature with a `kind` for data-driven styling.
type OverpassEl = {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

const POLY_KINDS = new Set([
  'green', 'bunker', 'fairway', 'tee', 'rough', 'water_hazard',
  'lateral_water_hazard', 'driving_range', 'clubhouse',
]);

export function toGeoJSON(elements: OverpassEl[]) {
  const features: any[] = [];
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    const kind = el.tags?.golf || 'other';
    const isPoly = POLY_KINDS.has(kind) && coords.length >= 3;
    if (isPoly) {
      const ring = [...coords];
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push(ring[0]);
      features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring] } });
    } else {
      features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: coords } });
    }
  }
  return { type: 'FeatureCollection', features } as const;
}

export const KIND_COLORS: Record<string, string> = {
  green: '#37c871',
  fairway: '#9bd329',
  tee: '#10d98a',
  bunker: '#f5e08a',
  water_hazard: '#3b82f6',
  lateral_water_hazard: '#3b82f6',
  rough: '#5b6b78',
  driving_range: '#2dd4bf',
  clubhouse: '#94a3b8',
  other: '#64748b',
};

export const colorMatchExpression: any[] = ['match', ['get', 'kind']];
for (const [k, c] of Object.entries(KIND_COLORS)) {
  if (k !== 'other') colorMatchExpression.push(k, c);
}
colorMatchExpression.push(KIND_COLORS.other);
