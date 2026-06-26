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
import { buildHoleModel, approachHeading, offsetToLonLat, lonLatToOffset } from '@/lib/holeStrategy';
import { teeStrategies } from '@/lib/teeStrategy';
import { optimizeStrategies, type Strategy } from '@/lib/shotModel';
import { buildGeoPolys, optimizeGeo, dispersionEllipse, haversineYd, type LL, type GeoOpt } from '@/lib/geoEval';
import { buildBag, recommendClub } from '@/lib/clubs';
import { shotConditions } from '@/lib/playing';
import { GreenMap } from '@/components/GreenMap';
import { useProfile } from '@/context/ProfileContext';

type Course = { name: string; lat: number; lon: number; osm_type?: string; osm_id?: number };

export default function CourseNavigation() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Course[]>([]);
  const [active, setActive] = useState<Course | null>(null);
  const [status, setStatus] = useState('');
  const [legend, setLegend] = useState<Record<string, number>>({});
  const [threeD, setThreeD] = useState(true);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [elements, setElements] = useState<any[]>([]);
  const [selectedHole, setSelectedHole] = useState<Hole | null>(null);
  const { profile } = useProfile();

  // Per-hole pin sheet — pin offset (approach-frame yards) relative to green
  // center, set via presets or by dragging the pin on the map. Persisted.
  const [pinSheet, setPinSheet] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('caddai.pinsheet') || '{}'); } catch { return {}; }
  });
  const holeKey = (h: Hole | null) => (h && active ? `${active.name.split(',')[0]}|${holes.indexOf(h)}` : '');
  const pinOffset = (selectedHole && pinSheet[holeKey(selectedHole)]) || { x: 0, y: 0 };
  const setPin = (offset: { x: number; y: number }) => {
    const key = holeKey(selectedHole);
    if (!key) return;
    setPinSheet((prev) => {
      const next = { ...prev, [key]: offset };
      try { localStorage.setItem('caddai.pinsheet', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const presetOffset = (name: string) => {
    const f = 0.6 * (selectedHole?.green?.radiusYds || 14);
    return ({ Center: { x: 0, y: 0 }, Front: { x: 0, y: -f }, Back: { x: 0, y: f }, Left: { x: -f, y: 0 }, Right: { x: f, y: 0 } } as Record<string, { x: number; y: number }>)[name];
  };
  const activePreset = (() => {
    for (const n of ['Center', 'Front', 'Back', 'Left', 'Right']) {
      const o = presetOffset(n);
      if (Math.abs(o.x - pinOffset.x) < 1.5 && Math.abs(o.y - pinOffset.y) < 1.5) return n;
    }
    return 'Custom';
  })();
  const heading = selectedHole ? approachHeading(selectedHole) : 0;

  const strategy = useMemo(
    () => (selectedHole ? buildHoleModel(selectedHole, elements, pinOffset) : null),
    [selectedHole, elements, pinOffset.x, pinOffset.y],
  );
  const opt = useMemo(
    () => (strategy ? optimizeStrategies(profile.offlineSD, profile.depthSD, { ...strategy.model, division: profile.division, shortGame: { sgArg: profile.sgArg, sgPutting: profile.sgPutting } }, 400) : null),
    [strategy, profile.offlineSD, profile.depthSD, profile.division, profile.sgArg, profile.sgPutting],
  );
  const [aimStrategy, setAimStrategy] = useState<Strategy>('optimal');
  const STRAT_COLOR: Record<Strategy, string> = { aggressive: '#ef4444', optimal: '#10d98a', safe: '#3b82f6' };
  const focus = opt ? opt[aimStrategy] : null;

  const tee = useMemo(
    () => (selectedHole ? teeStrategies(selectedHole, elements, profile.drivingDistance) : null),
    [selectedHole, elements, profile.drivingDistance],
  );
  // Recommend a club for each tee line and for the approach (plays-like distance).
  const bag = useMemo(() => buildBag(profile.drivingDistance, profile.offlineSD, profile.depthSD),
    [profile.drivingDistance, profile.offlineSD, profile.depthSD]);
  const approachYds = tee?.lines.find((l) => l.label === 'Optimal')?.remainingYds ?? selectedHole?.yards ?? 0;
  const approachClub = approachYds ? recommendClub(bag, shotConditions(approachYds).playsLike) : null;

  // --- Unified Prepare map: live geo-space Expected Strokes against real polygons ---
  // The "start" is where you're playing from; tap the map to move it. Pin is the
  // green marker. The three optimizers + dispersion ellipse are drawn on the map.
  const [startPt, setStartPt] = useState<LL | null>(null);
  const pinLL = useMemo<LL | null>(() => {
    if (!selectedHole?.green) return null;
    const g = { lat: selectedHole.green.lat, lon: selectedHole.green.lon };
    const ll = offsetToLonLat(g, pinOffset, heading) as [number, number];
    return [ll[0], ll[1]];
  }, [selectedHole, pinOffset.x, pinOffset.y, heading]);
  // Default start = the optimal tee landing (approach length) or the tee itself.
  useEffect(() => {
    if (!selectedHole) { setStartPt(null); return; }
    const optLine = tee?.lines.find((l) => l.label === 'Optimal');
    setStartPt((optLine?.target as LL) || (selectedHole.path[0] as LL) || null);
  }, [selectedHole, tee]);

  const geoPolys = useMemo(
    () => (pinLL ? buildGeoPolys(elements as any, { lat: pinLL[1], lon: pinLL[0] }) : null),
    [elements, pinLL],
  );
  const apprOffSD = approachClub?.offlineSD ?? profile.offlineSD;
  const apprDepthSD = approachClub?.depthSD ?? profile.depthSD;
  const geoOpt = useMemo<GeoOpt | null>(
    () => (startPt && pinLL && geoPolys
      ? optimizeGeo(startPt, pinLL, geoPolys, apprOffSD, apprDepthSD, profile.division, { sgArg: profile.sgArg, sgPutting: profile.sgPutting })
      : null),
    [startPt, pinLL, geoPolys, apprOffSD, apprDepthSD, profile.division, profile.sgArg, profile.sgPutting],
  );
  const geoFocus = geoOpt ? geoOpt[aimStrategy] : null;
  const focusDistanceYd = startPt && pinLL ? haversineYd(startPt, pinLL) : 0;

  // Draw the tee-shot lines on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapboxConfigured) return;
    const src = map.getSource('tee-lines') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    if (!selectedHole || !tee) { src.setData({ type: 'FeatureCollection', features: [] } as any); return; }
    const teePt = selectedHole.path[0];
    const features = tee.lines.flatMap((L) => [
      { type: 'Feature', properties: { kind: L.label }, geometry: { type: 'LineString', coordinates: [teePt, L.target] } },
      { type: 'Feature', properties: { kind: L.label }, geometry: { type: 'Point', coordinates: L.target } },
    ]);
    src.setData({ type: 'FeatureCollection', features } as any);
  }, [selectedHole, tee]);

  // Draw the Prepare overlay: start point, start→aim line, three optimizer aims,
  // and the dispersion ellipse around the focused aim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapboxConfigured) return;
    const src = map.getSource('prepare') as mapboxgl.GeoJSONSource | undefined;
    const esrc = map.getSource('prepare-ellipse') as mapboxgl.GeoJSONSource | undefined;
    if (!src || !esrc) return;
    const empty = { type: 'FeatureCollection', features: [] } as any;
    if (!geoOpt || !startPt || !geoFocus) { src.setData(empty); esrc.setData(empty); return; }
    const feats: any[] = [
      { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: startPt } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [startPt, geoFocus.aim] } },
      ...(['aggressive', 'optimal', 'safe'] as Strategy[]).map((s) => ({
        type: 'Feature', properties: { role: 'aim', kind: s, focused: s === aimStrategy },
        geometry: { type: 'Point', coordinates: geoOpt[s].aim },
      })),
    ];
    src.setData({ type: 'FeatureCollection', features: feats } as any);
    const ring = dispersionEllipse(startPt, geoFocus.aim, apprOffSD, apprDepthSD);
    esrc.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } as any);
  }, [geoOpt, startPt, aimStrategy, geoFocus, apprOffSD, apprDepthSD]);

  // Tap the map to set the start point (where you're playing from).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapboxConfigured) return;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!selectedHole) return;
      setStartPt([e.lngLat.lng, e.lngLat.lat]);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [selectedHole]);

  // Draggable pin marker + green outline for the selected hole.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapboxConfigured || !selectedHole?.green) return;
    const green = { lat: selectedHole.green.lat, lon: selectedHole.green.lon };

    const drawGreen = () => {
      const src = map.getSource('green-hi') as mapboxgl.GeoJSONSource | undefined;
      if (src && selectedHole.greenPath?.length)
        src.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [selectedHole.greenPath] } } as any);
    };
    if (map.isStyleLoaded()) drawGreen(); else map.once('idle', drawGreen);

    const el = document.createElement('div');
    Object.assign(el.style, {
      width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444',
      border: '2px solid #fff', boxShadow: '0 0 0 3px rgba(239,68,68,.35)', cursor: 'grab',
    });
    el.title = 'Drag to set the pin';
    const marker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat(offsetToLonLat(green, pinOffset, heading))
      .addTo(map);
    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      const off = lonLatToOffset(green, [ll.lng, ll.lat], heading);
      setPin({ x: Math.round(off.x), y: Math.round(off.y) });
    });
    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
      const src = map.getSource('green-hi') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: 'FeatureCollection', features: [] } as any);
    };
    // Recreate only when the hole (or its heading) changes, not on every drag.
  }, [selectedHole, heading]);

  // Reposition the marker when the pin offset changes via presets.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !selectedHole?.green) return;
    marker.setLngLat(offsetToLonLat({ lat: selectedHole.green.lat, lon: selectedHole.green.lon }, pinOffset, heading));
  }, [pinOffset.x, pinOffset.y]);

  // 2D / 3D toggle: tilt the camera and switch terrain relief on/off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapboxConfigured) return;
    const apply = () => {
      map.easeTo({ pitch: threeD ? 60 : 0, duration: 600 });
      try { map.setTerrain(threeD ? { source: 'mapbox-dem', exaggeration: 1.3 } : null); } catch {}
    };
    if (map.isStyleLoaded()) apply(); else map.once('idle', apply);
  }, [threeD]);

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
      // 3D terrain relief (Mapbox DEM) + sky for a true 3D course view.
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 });
      if (!map.getLayer('sky')) {
        map.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 12 } } as any);
      }
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
      // Selected hole's green outline.
      map.addSource('green-hi', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'green-hi-fill', type: 'fill', source: 'green-hi', paint: { 'fill-color': '#37c871', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'green-hi-line', type: 'line', source: 'green-hi', paint: { 'line-color': '#37c871', 'line-width': 2 } });
      // Tee-shot lines (aggressive / optimal / conservative).
      map.addSource('tee-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'tee-lines-line', type: 'line', source: 'tee-lines',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-width': 3.5,
          'line-color': ['match', ['get', 'kind'], 'Aggressive', '#ef4444', 'Conservative', '#3b82f6', '#10d98a'],
        },
      });
      map.addLayer({
        id: 'tee-lines-end', type: 'circle', source: 'tee-lines',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': ['match', ['get', 'kind'], 'Aggressive', '#ef4444', 'Conservative', '#3b82f6', '#10d98a'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' },
      });

      // Prepare overlay: dispersion ellipse, aim line, and the three optimizer aims.
      map.addSource('prepare-ellipse', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'prepare-ellipse-fill', type: 'fill', source: 'prepare-ellipse', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'prepare-ellipse-line', type: 'line', source: 'prepare-ellipse', paint: { 'line-color': '#ffffff', 'line-opacity': 0.6, 'line-width': 1, 'line-dasharray': [2, 2] } });

      map.addSource('prepare', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'prepare-line', type: 'line', source: 'prepare', filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round' }, paint: { 'line-width': 2, 'line-color': '#ffffff', 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'prepare-aims', type: 'circle', source: 'prepare', filter: ['==', ['get', 'role'], 'aim'],
        paint: {
          'circle-radius': ['case', ['get', 'focused'], 8, 6],
          'circle-color': ['match', ['get', 'kind'], 'aggressive', '#ef4444', 'safe', '#3b82f6', '#10d98a'],
          'circle-stroke-width': ['case', ['get', 'focused'], 3, 1.5], 'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: 'prepare-start', type: 'circle', source: 'prepare', filter: ['==', ['get', 'role'], 'start'],
        paint: { 'circle-radius': 6, 'circle-color': '#0a1420', 'circle-stroke-width': 3, 'circle-stroke-color': '#fbbf24' },
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
        .map((x: any) => ({ name: x.name, lat: x.lat, lon: x.lon, type: x.type, category: x.category, osm_type: x.osm_type, osm_id: x.osm_id }))
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
      const osm = c.osm_type && c.osm_id ? `&osm_type=${c.osm_type}&osm_id=${c.osm_id}` : '';
      const r = await fetch(`/api/course?lat=${c.lat}&lon=${c.lon}&radius=1600${osm}`);
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
    // Orient the camera straight down the hole (tee -> green) and frame it.
    const headingDeg = (approachHeading(h) * 180) / Math.PI;
    if (h.path.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds(h.path[0], h.path[0]);
      h.path.forEach((c) => bounds.extend(c as [number, number]));
      if (h.green) bounds.extend([h.green.lon, h.green.lat]);
      map.fitBounds(bounds, { bearing: headingDeg, pitch: 60, padding: 90, maxZoom: 17.5, duration: 1300 });
    } else if (h.green) {
      map.flyTo({ center: [h.green.lon, h.green.lat], zoom: 16.8, bearing: headingDeg, pitch: 60, essential: true });
    }
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
          <>
            <div ref={mapEl} className="absolute inset-0" />
            <button onClick={() => setThreeD((v) => !v)}
              className="absolute left-3 top-3 z-10 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold shadow backdrop-blur hover:bg-card">
              {threeD ? '2D' : '3D'} view
            </button>
          </>
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
          <div className="absolute bottom-3 left-3 right-3 mx-auto flex max-h-[calc(100%-1.5rem)] max-w-md flex-col overflow-auto rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur md:right-auto md:w-[340px]">
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

            {tee && selectedHole.par && selectedHole.par >= 4 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tee shot</div>
                <div className="space-y-1">
                  {tee.lines.map((L) => (
                    <div key={L.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: L.label === 'Aggressive' ? '#ef4444' : L.label === 'Conservative' ? '#3b82f6' : '#10d98a' }} />
                        {L.label} <span className="text-muted-foreground">· {recommendClub(bag, L.carry).name}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">{L.carry} yd · {L.remainingYds} left · ES {L.es.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Approach</span>
              {approachClub && <span className="font-normal normal-case">{approachClub.name} · ~{approachYds} yd</span>}
            </div>
            {focus && (
              <>
                <div className="mt-1.5 flex gap-1">
                  {(['aggressive', 'optimal', 'safe'] as Strategy[]).map((s) => (
                    <button key={s} onClick={() => setAimStrategy(s)}
                      className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${aimStrategy === s ? 'text-foreground' : 'text-muted-foreground'}`}
                      style={{ borderColor: aimStrategy === s ? STRAT_COLOR[s] : 'var(--border)', background: aimStrategy === s ? `${STRAT_COLOR[s]}1a` : 'transparent' }}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STRAT_COLOR[s] }} />
                      {s === 'optimal' ? 'Opt' : s === 'aggressive' ? 'Aggr' : 'Safe'} {(geoOpt ? geoOpt[s].es : opt![s].es).toFixed(2)}
                    </button>
                  ))}
                </div>
                {geoFocus && (
                  <div className="mt-1.5 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">On-map target (real polygons)</span>
                      <span className="font-semibold" style={{ color: STRAT_COLOR[aimStrategy] }}>ES {geoFocus.es.toFixed(2)} · risk {geoFocus.cvar.toFixed(2)}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">Tap the map to move your start point ({Math.round(focusDistanceYd)} yd to pin).</div>
                  </div>
                )}
                <div className="mt-1.5 grid grid-cols-[120px_1fr] gap-3">
                  <div className="aspect-square"><GreenMap model={strategy.model} aim={focus.aim} landings={focus.result.landings} span={Math.max(28, strategy.model.greenRadius + 14)}
                    markers={(['aggressive', 'optimal', 'safe'] as Strategy[]).map((s) => ({ x: opt![s].aim.x, y: opt![s].aim.y, color: STRAT_COLOR[s], label: s[0].toUpperCase() }))} /></div>
                  <div className="space-y-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground">Aim </span>
                      <span className="font-semibold">
                        {Math.abs(focus.aim.x) < 2 && Math.abs(focus.aim.y) < 2
                          ? 'at the pin'
                          : `${focus.aim.x ? `${Math.abs(focus.aim.x)} ${focus.aim.x > 0 ? 'R' : 'L'}` : ''}${focus.aim.x && focus.aim.y ? ', ' : ''}${focus.aim.y ? `${Math.abs(focus.aim.y)} ${focus.aim.y > 0 ? 'long' : 'short'}` : ''}`}
                      </span>
                    </div>
                    <div><span className="text-muted-foreground">ES remaining </span><span className="font-bold text-primary">{focus.es.toFixed(2)}</span> <span className="text-[11px] text-muted-foreground">· risk {focus.cvar.toFixed(2)}</span></div>
                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {(['green', 'rough', 'sand', 'water'] as const).map((o) => (
                        <span key={o} title={o}>{o[0].toUpperCase()} {Math.round(focus.result.breakdown[o] * 100)}%</span>
                      ))}
                    </div>
                    <div className="pt-1 text-[11px] text-muted-foreground">Your σ {profile.offlineSD}/{profile.depthSD} yd</div>
                  </div>
                </div>
              </>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Pin sheet</span>
                {isMapboxConfigured && <span className="font-normal normal-case">drag the red pin on the map</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Front', 'Left', 'Center', 'Right', 'Back'].map((p) => (
                  <button key={p} onClick={() => setPin(presetOffset(p))}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      activePreset === p ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>{p}</button>
                ))}
                {activePreset === 'Custom' && (
                  <span className="rounded-full border border-primary bg-primary/15 px-2.5 py-0.5 text-xs text-primary">Custom</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
