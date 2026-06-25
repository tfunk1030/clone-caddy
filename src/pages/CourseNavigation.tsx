import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Search, MapPin, Layers, AlertTriangle, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAPBOX_TOKEN, isMapboxConfigured, MAP_STYLE } from '@/lib/mapbox';
import { toGeoJSON, colorMatchExpression, KIND_COLORS } from '@/lib/overpass';
import { extractHoles, courseSummary, type Hole } from '@/lib/holes';
import { buildHoleModel } from '@/lib/holeStrategy';
import { optimizeAim } from '@/lib/shotModel';
import { GreenMap } from '@/components/GreenMap';
import { useProfile } from '@/context/ProfileContext';

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
  const [elements, setElements] = useState<any[]>([]);
  const [selectedHole, setSelectedHole] = useState<Hole | null>(null);
  const { profile } = useProfile();

  const strategy = useMemo(() => (selectedHole ? buildHoleModel(selectedHole, elements) : null), [selectedHole, elements]);
  const opt = useMemo(
    () => (strategy ? optimizeAim(profile.offlineSD, profile.depthSD, strategy.model, 500) : null),
    [strategy, profile.offlineSD, profile.depthSD],
  );

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
      setElements(data.elements || []);
      const hs = extractHoles(data.elements || []);
      setHoles(hs);
      setSelectedHole(null);
      setStatus(`${data.count || 0} features · ${hs.length} holes`);
    } catch {
      setStatus('Could not load course features.');
    }
  };

  const selectHole = (h: Hole) => {
    setSelectedHole(h);
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
                    selectedHole === h ? 'border-primary bg-primary/15 text-primary' : 'border-border hover:bg-muted'
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

      <div className="relative min-h-[340px] flex-1">
        {isMapboxConfigured ? (
          <div ref={mapEl} className="absolute inset-0" />
        ) : (
          <div className="grid h-full place-items-center p-6">
            <Card className="max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> 3D map needs a Mapbox token</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Course search, the hole list, and per-hole strategy all work without it — but the 3D satellite map needs <code className="rounded bg-muted px-1">VITE_MAPBOX_TOKEN</code> set in your environment (Vercel project env or local <code className="rounded bg-muted px-1">.env</code>), then redeploy.</p>
                <p>Get a free token at <a className="text-primary underline" href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener">account.mapbox.com</a>.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedHole && strategy && opt && (
          <div className="absolute bottom-3 left-3 right-3 mx-auto max-w-md rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur md:right-auto md:w-[340px]">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-bold">
                  Hole {selectedHole.number}{selectedHole.par ? ` · par ${selectedHole.par}` : ''} · {selectedHole.yards} yd
                </div>
                <div className="text-xs text-muted-foreground">
                  {strategy.model.greenRadius} yd green ·{' '}
                  {strategy.bunkers ? `${strategy.bunkers} greenside bunker${strategy.bunkers > 1 ? 's' : ''}` : 'no bunkers'}
                  {strategy.water ? ` · water ${strategy.water}` : ''}
                </div>
              </div>
              <button onClick={() => setSelectedHole(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="mt-3 grid grid-cols-[120px_1fr] gap-3">
              <div className="aspect-square"><GreenMap model={strategy.model} aim={opt.best} landings={opt.result.landings} span={Math.max(28, strategy.model.greenRadius + 14)} /></div>
              <div className="space-y-1.5 text-sm">
                <div>
                  <span className="text-muted-foreground">Aim </span>
                  <span className="font-semibold">
                    {Math.abs(opt.best.x) < 2 && Math.abs(opt.best.y) < 2
                      ? 'at the pin'
                      : `${opt.best.x ? `${Math.abs(opt.best.x)} ${opt.best.x > 0 ? 'R' : 'L'}` : ''}${opt.best.x && opt.best.y ? ', ' : ''}${opt.best.y ? `${Math.abs(opt.best.y)} ${opt.best.y > 0 ? 'long' : 'short'}` : ''}`}
                  </span>
                </div>
                <div><span className="text-muted-foreground">ES remaining </span><span className="font-bold text-primary">{opt.bestES.toFixed(2)}</span></div>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {(['green', 'rough', 'sand', 'water'] as const).map((o) => (
                    <span key={o} title={o}>{o[0].toUpperCase()} {Math.round(opt.result.breakdown[o] * 100)}%</span>
                  ))}
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">Your σ {profile.offlineSD}/{profile.depthSD} yd · pin assumed center</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
