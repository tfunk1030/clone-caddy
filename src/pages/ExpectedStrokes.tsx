import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { GreenMap } from '@/components/GreenMap';
import { optimizeAim, type GreenModel } from '@/lib/shotModel';
import { ES_NOTE, DIVISIONS } from '@/lib/expectedStrokes';
import { buildBag, recommendClub } from '@/lib/clubs';
import { shotConditions } from '@/lib/playing';
import { useProfile } from '@/context/ProfileContext';

const PINS: Record<string, { x: number; y: number }> = {
  Center: { x: 0, y: 0 }, 'Tucked Left': { x: 8, y: 0 }, 'Tucked Right': { x: -8, y: 0 },
  Front: { x: 0, y: 8 }, Back: { x: 0, y: -8 },
};
const WATERS: Record<string, GreenModel['water']> = {
  None: null, Left: { side: 'L', line: 5 }, Right: { side: 'R', line: 5 },
  Long: { side: 'long', line: 6 }, Short: { side: 'short', line: 6 },
};
// Wind direction relative to the shot (target is "up", bearing 0). Value = the
// compass direction the wind comes FROM.
const WIND_DIRS: Record<string, number | null> = { Calm: null, Into: 0, Down: 180, 'R → L': 90, 'L → R': 270 };
const OUT_COLOR: Record<string, string> = { green: '#37c871', rough: '#5b6b78', sand: '#f5e08a', water: '#3b82f6' };

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            value === o ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}>{o}</button>
      ))}
    </div>
  );
}
const fmtYd = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(0)}`;

export default function ExpectedStrokes() {
  const { profile, setProfile } = useProfile();
  const [distance, setDistance] = useState(165);
  const [windDir, setWindDir] = useState('R → L');
  const [windMph, setWindMph] = useState(12);
  const [elevationYd, setElevationYd] = useState(0);
  const [firmness, setFirmness] = useState<'Soft' | 'Medium' | 'Firm' | 'Very Firm'>('Medium');
  const [slope, setSlope] = useState(2);
  const [greenRadius, setGreenRadius] = useState(15);
  const [pin, setPin] = useState('Tucked Left');
  const [water, setWater] = useState('Right');
  const [bunker, setBunker] = useState(true);

  const bag = useMemo(() => buildBag(profile.drivingDistance, profile.offlineSD, profile.depthSD), [profile.drivingDistance, profile.offlineSD, profile.depthSD]);
  const cond = useMemo(() => shotConditions(distance, {
    windMph: WIND_DIRS[windDir] == null ? 0 : windMph,
    windFromDeg: WIND_DIRS[windDir] ?? 0, shotBearingDeg: 0, elevationYd, firmness,
  }), [distance, windDir, windMph, elevationYd, firmness]);
  const club = useMemo(() => recommendClub(bag, cond.playsLike), [bag, cond.playsLike]);

  const model: GreenModel = useMemo(() => ({
    greenRadius, greenCenter: PINS[pin], water: WATERS[water],
    bunker: bunker ? { x: -10, y: -10, r: 6 } : null, penaltyStrokes: 1, slopeSeverity: slope,
    division: profile.division,
  }), [greenRadius, pin, water, bunker, slope, profile.division]);

  const wind = useMemo(() => ({ driftX: cond.driftX, widen: cond.widen }), [cond.driftX, cond.widen]);
  const opt = useMemo(() => optimizeAim(club.offlineSD, club.depthSD, model, 700, wind),
    [club.offlineSD, club.depthSD, model, wind]);

  const aimDesc = (() => {
    const { x, y } = opt.best;
    if (Math.abs(x) < 2 && Math.abs(y) < 2) return 'straight at the pin';
    const lat = x === 0 ? '' : `${Math.abs(x)} yd ${x > 0 ? 'right' : 'left'}`;
    const dep = y === 0 ? '' : `${Math.abs(y)} yd ${y > 0 ? 'long' : 'short'}`;
    return [lat, dep].filter(Boolean).join(', ') + ' of pin';
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Expected Strokes</h1>
        <p className="text-muted-foreground">Club, wind, elevation and slope all feed the aim that minimizes expected strokes.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader><CardTitle>Shot &amp; conditions</CardTitle><CardDescription>Approach to the green.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Distance to pin: <span className="font-semibold text-foreground">{distance} yd</span></Label>
              <input type="range" min={60} max={240} value={distance} onChange={(e) => setDistance(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5"><Label>Wind</Label><Chips options={Object.keys(WIND_DIRS)} value={windDir} onChange={setWindDir} /></div>
            {WIND_DIRS[windDir] != null && (
              <div className="space-y-1.5">
                <Label>Wind speed: <span className="font-semibold text-foreground">{windMph} mph</span></Label>
                <input type="range" min={0} max={35} value={windMph} onChange={(e) => setWindMph(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Elevation: <span className="font-semibold text-foreground">{fmtYd(elevationYd)} yd</span> {elevationYd > 0 ? '(uphill)' : elevationYd < 0 ? '(downhill)' : ''}</Label>
              <input type="range" min={-25} max={25} value={elevationYd} onChange={(e) => setElevationYd(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5"><Label>Firmness</Label><Chips options={['Soft', 'Medium', 'Firm', 'Very Firm']} value={firmness} onChange={(v) => setFirmness(v as any)} /></div>
            <div className="space-y-1.5">
              <Label>Green slope: <span className="font-semibold text-foreground">{slope}/5</span></Label>
              <input type="range" min={0} max={5} value={slope} onChange={(e) => setSlope(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5">
              <Label>Green radius: <span className="font-semibold text-foreground">{greenRadius} yd</span></Label>
              <input type="range" min={8} max={24} value={greenRadius} onChange={(e) => setGreenRadius(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5"><Label>Pin</Label><Chips options={Object.keys(PINS)} value={pin} onChange={setPin} /></div>
            <div className="space-y-1.5"><Label>Water</Label><Chips options={Object.keys(WATERS)} value={water} onChange={setWater} /></div>
            <div className="space-y-1.5"><Label>Greenside bunker</Label><Chips options={['On', 'Off']} value={bunker ? 'On' : 'Off'} onChange={(v) => setBunker(v === 'On')} /></div>
            <div className="space-y-2 border-t border-border pt-3">
              <Label>Your game</Label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Division (strokes-gained baseline)</span>
                <select value={profile.division} onChange={(e) => setProfile({ division: e.target.value as any })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1">
                  {DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1"><span className="text-muted-foreground">Driver carry</span>
                  <input type="number" value={profile.drivingDistance} onChange={(e) => setProfile({ drivingDistance: +e.target.value || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1" /></label>
                <label className="space-y-1"><span className="text-muted-foreground">Stock σ (off/depth)</span>
                  <div className="flex gap-1">
                    <input type="number" value={profile.offlineSD} onChange={(e) => setProfile({ offlineSD: +e.target.value || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1" />
                    <input type="number" value={profile.depthSD} onChange={(e) => setProfile({ depthSD: +e.target.value || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1" />
                  </div>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Club</div>
              <div className="mt-1 font-display text-2xl font-bold text-primary">{club.name}</div>
              <div className="text-xs text-muted-foreground">{club.carry} yd carry</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Plays like</div>
              <div className="mt-1 font-display text-2xl font-bold">{cond.playsLike.toFixed(0)} yd</div>
              <div className="text-xs text-muted-foreground">{distance} yd raw</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">ES (optimal)</div>
              <div className="mt-1 font-display text-2xl font-bold text-primary">{opt.bestES.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">vs {opt.pinES.toFixed(2)} at pin</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Strokes saved</div>
              <div className={`mt-1 font-display text-2xl font-bold ${opt.saved > 0.005 ? 'text-primary' : ''}`}>−{Math.max(0, opt.saved).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">vs aiming at pin</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Optimal target</CardTitle>
              <CardDescription>Heatmap = expected strokes by aim point (blue = best). White + is the optimal aim, {aimDesc}.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[360px_1fr]">
                <div className="aspect-square w-full max-w-[360px]">
                  <GreenMap model={model} aim={opt.best} landings={opt.result.landings} surface={opt.surface} />
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-background p-3 text-sm">
                    <div className="mb-1 font-semibold">Plays-like breakdown</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Wind ({cond.head >= 0 ? `${cond.head} into` : `${-cond.head} down`}{cond.cross ? `, ${Math.abs(cond.cross)} cross` : ''})</span><span className="text-right text-foreground">{fmtYd(cond.breakdown.windYd)} yd</span>
                      <span>Elevation</span><span className="text-right text-foreground">{fmtYd(cond.breakdown.elevationYd)} yd</span>
                      <span>Air (alt/temp)</span><span className="text-right text-foreground">{fmtYd(cond.breakdown.airYd)} yd</span>
                      <span>Firmness rollout</span><span className="text-right text-foreground">{fmtYd(cond.breakdown.firmnessYd)} yd</span>
                    </div>
                    {cond.driftX !== 0 && <div className="mt-1 text-xs text-muted-foreground">Crosswind drifts the ball {Math.abs(cond.driftX)} yd {cond.driftX < 0 ? 'left' : 'right'} — aim accounts for it.</div>}
                  </div>
                  <div className="text-sm font-semibold">Outcome breakdown</div>
                  {(['green', 'rough', 'sand', 'water'] as const).map((o) => (
                    <div key={o}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="capitalize">{o === 'water' ? 'penalty' : o}</span>
                        <span className="text-muted-foreground">{Math.round(opt.result.breakdown[o] * 100)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full" style={{ width: `${opt.result.breakdown[o] * 100}%`, background: OUT_COLOR[o] }} />
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">{ES_NOTE}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
