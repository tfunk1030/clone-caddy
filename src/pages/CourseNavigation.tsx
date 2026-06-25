import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Search, MapPin, Layers, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAPBOX_TOKEN, isMapboxConfigured, MAP_STYLE } from '@/lib/mapbox';
import { toGeoJSON, colorMatchExpression, KIND_COLORS } from '@/lib/overpass';

type Course = { name: string; lat: number; lon: number };

export default function CourseNavigation() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Course[]>([]);
  const [active, setActive] = useState<Course | null>(null);
  const [status, setStatus] = useState('');
  const [legend, setLegend] = useState<Record<string, number>>({});

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
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus('Searching…');
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=6`);
      const data = await r.json();
      setResults((data.results || []).map((x: any) => ({ name: x.name, lat: x.lat, lon: x.lon })));
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
      setStatus(`${data.count || 0} features loaded`);
    } catch {
      setStatus('Could not load course features.');
    }
  };

  if (!isMapboxConfigured) {
    return (
      <div className="grid h-full place-items-center p-6">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Mapbox token needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>The 3D course map needs a Mapbox access token. Set <code className="rounded bg-muted px-1">VITE_MAPBOX_TOKEN</code> in your environment (Vercel project env or a local <code className="rounded bg-muted px-1">.env</code>), then redeploy.</p>
            <p>Get a free token at <a className="text-primary underline" href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener">account.mapbox.com</a>.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      </div>

      <div ref={mapEl} className="min-h-[320px] flex-1" />
    </div>
  );
}
