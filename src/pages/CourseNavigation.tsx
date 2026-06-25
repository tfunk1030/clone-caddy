import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Search, MapPin, Layers, AlertTriangle, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAPBOX_TOKEN, isMapboxConfigured, MAP_STYLE } from '@/lib/mapbox';
import { toGeoJSON, colorMatchExpression, KIND_COLORS } from '@/lib/overpass';
import { extractHoles, courseSummary, type Hole } from '@/lib/holes';

type Course = { name: string; lat: number; lon: number };

export default function CourseNavigation() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Course[]>([]);
  const [active, setActive] = useState<Course | null>(null);
  const [status, setStatus] = useState('');
  const [legend, setLegend] = useState<Record<string, number>>({});
  const [holes, setHoles] = useState<Hole[]>([]);
  const [selectedHole, setSelectedHole] = useState<number | null>(null);

  // Init map once.
  useEffect(() => {
    if (!isMapboxConfigured || !mapEl.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: [-2.8019, 56.3487], // St Andrews
      zoom: 14,
      pitch: 55,
      antialias: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      map.addSource('course', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'course-fill', type: 'fill', source: 'course',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colorMatchExpression as any, 'fill-opacity': 0.55 },
      });
      map.addLayer({
        id: 'course-line', type: 'line', source: 'course',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': colorMatchExpression as any, 'line-width': 2 },
      });
      // Highlight for the selected hole's centerline.
      map.addSource('hole-hi', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'hole-hi-line', type: 'line', source: 'hole-hi',
        paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 1] },
      });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus('Searching…');
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=10`);
      const data = await r.json();
      // Rank actual golf courses ahead of streets/places of the same name.
      const golfRank = (x: any) =>
        (x.type === 'golf_course' ? 0 : x.category === 'leisure' ? 1 : /golf|links|country club/i.test(x.name) ? 2 : 3);
      const ranked = (data.results || [])
        .map((x: any) => ({ name: x.name, lat: x.lat, lon: x.lon, type: x.type, category: x.category }))
        .sort((a: any, b: any) => golfRank(a) - golfRank(b))
        .slice(0, 6);
      setResults(ranked);
      setStatus('');
    } catch {
      setStatus('Search failed.');
    }
  };

  const selectCourse = async (c: Course) => {
    setActive(c);
    setResults([]);
    setQuery(c.name.split(',')[0]);
    const map = mapRef.current;
    if (map) map.flyTo({ center: [c.lon, c.lat], zoom: 15.5, pitch: 60, essential: true });
    setStatus('Loading course features…');
    try {
      const r = await fetch(`/api/course?lat=${c.lat}&lon=${c.lon}&radius=1600`);
      const data = await r.json();
      const fc = toGeoJSON(data.elements || []);
      const src = map?.getSource('course') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(fc as any);
      setLegend(data.byType || {});
      const hs = extractHoles(data.elements || []);
      setHoles(hs);
      setSelectedHole(null);
      setStatus(`${data.count || 0} features · ${hs.length} holes`);
    } catch {
      setStatus('Could not load course features.');
    }
  };

  const selectHole = (h: Hole) => {
    setSelectedHole(h.number);
    const map = mapRef.current;
    if (!map) return;
    const hi = map.getSource('hole-hi') as mapboxgl.GeoJSONSource | undefined;
    if (hi) hi.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: h.path } } as any);
    if (h.green) map.flyTo({ center: [h.green.lon, h.green.lat], zoom: 16.8, pitch: 62, essential: true });
  };

  const summary = courseSummary(holes);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="w-full shrink-0 space-y-4 border-b border-border bg-card p-4 md:w-80 md:border-b-0 md:border-r">
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">Course Navigation</h2>
          <p className="text-sm text-muted-foreground">Search a course to map it in 3D.</p>
        </div>
        <form onSubmit={search} className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses…" />
          <Button type="submit" size="icon"><Search className="h-4 w-4" /></Button>
        </form>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}

        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((c) => (
              <button key={`${c.lat},${c.lon}`} onClick={() => selectCourse(c)}
                className="flex w-full items-start gap-2 rounded-md border border-border p-2 text-left text-sm hover:bg-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="line-clamp-2">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {active && Object.keys(legend).length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> Features</div>
            <div className="space-y-1">
              {Object.entries(legend).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: KIND_COLORS[k] || KIND_COLORS.other }} />
                    {k.replace(/_/g, ' ')}
                  </span>
                  <span className="text-muted-foreground">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {holes.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><Flag className="h-4 w-4" /> Holes</span>
              <span className="text-xs font-normal text-muted-foreground">
                {summary.totalPar ? `par ${summary.totalPar} · ` : ''}{summary.totalYds.toLocaleString()} yd
              </span>
            </div>
            <div className="max-h-72 space-y-1 overflow-auto pr-1">
              {holes.map((h, i) => (
                <button key={i} onClick={() => selectHole(h)}
                  className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                    selectedHole === h.number ? 'border-primary bg-primary/15 text-primary' : 'border-border hover:bg-muted'
                  }`}>
                  <span className="flex items-center gap-2">
                    <span className="inline-grid h-5 w-5 place-items-center rounded bg-muted text-[11px] font-bold">{h.number}</span>
                    {h.par && <span className="text-xs text-muted-foreground">par {h.par}</span>}
                  </span>
                  <span className="text-xs tabular-nums">{h.yards} yd</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isMapboxConfigured ? (
        <div ref={mapEl} className="min-h-[320px] flex-1" />
      ) : (
        <div className="grid min-h-[320px] flex-1 place-items-center p-6">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> 3D map needs a Mapbox token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Course search and the hole list work without it — but the 3D satellite map needs <code className="rounded bg-muted px-1">VITE_MAPBOX_TOKEN</code> set in your environment (Vercel project env or local <code className="rounded bg-muted px-1">.env</code>), then redeploy.</p>
              <p>Get a free token at <a className="text-primary underline" href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener">account.mapbox.com</a>.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
