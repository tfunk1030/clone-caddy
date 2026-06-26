import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { GreenMap } from '@/components/GreenMap';
import { optimizeStrategies, type GreenModel, type Strategy } from '@/lib/shotModel';
import { ES_NOTE, DIVISIONS } from '@/lib/expectedStrokes';
import { buildBag, recommendClub } from '@/lib/clubs';
import { shotConditions } from '@/lib/playing';
import { GREEN_SPEEDS, FIRMNESS_ORDER, stimpPuttFactor, type Firmness } from '@/lib/conditions';
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
  const [firmness, setFirmness] = useState<Firmness>('Medium');
  const [stimp, setStimp] = useState(10);
  const [slope, setSlope] = useState(2);
  const [greenRadius, setGreenRadius] = useState(15);
  const [pin, setPin] = useState('Tucked Left');
  const [water, setWater] = useState('Right');
  const [bunker, setBunker] = useState(true);
  const [strategy, setStrategy] = useState<Strategy>('optimal');

  const bag = useMemo(() => buildBag(profile.drivingDistance, profile.offlineSD, profile.depthSD), [profile.drivingDistance, profile.offlineSD, profile.depthSD]);
  const cond = useMemo(() => shotConditions(distance, {
    windMph: WIND_DIRS[windDir] == null ? 0 : windMph,
    windFromDeg: WIND_DIRS[windDir] ?? 0, shotBearingDeg: 0, elevationYd, firmness,
  }), [distance, windDir, windMph, elevationYd, firmness]);
  const club = useMemo(() => recommendClub(bag, cond.playsLike), [bag, cond.playsLike]);

  const model: GreenModel = useMemo(() => ({
    greenRadius, greenCenter: PINS[pin], water: WATERS[water],
    bunker: bunker ? { x: -10, y: -10, r: 6 } : null, penaltyStrokes: 1, slopeSeverity: slope,
    puttFactor: stimpPuttFactor(stimp),
    division: profile.division,
    shortGame: { sgArg: profile.sgArg, sgPutting: profile.sgPutting },
  }), [greenRadius, pin, water, bunker, slope, stimp, profile.division, profile.sgArg, profile.sgPutting]);

  const wind = useMemo(() => ({ driftX: cond.driftX, widen: cond.widen }), [cond.driftX, cond.widen]);
  const opt = useMemo(() => optimizeStrategies(club.offlineSD, club.depthSD, model, 500, wind),
    [club.offlineSD, club.depthSD, model, wind]);

  // The three optimizers, plus the focused one (selected by the strategy chips).
  const STRAT_META: Record<Strategy, { label: string; color: string; blurb: string }> = {
    aggressive: { label: 'Aggressive', color: '#ef4444', blurb: 'Most upside — chases the close approach.' },
    optimal: { label: 'Optimal', color: '#37c871', blurb: 'Lowest average score.' },
    safe: { label: 'Safe', color: '#3b82f6', blurb: 'Lowest risk — avoids the big numbers (CVaR).' },
  };
  const focus = opt[strategy];
  const markers = (['aggressive', 'optimal', 'safe'] as Strategy[]).map((s) => ({
    x: opt[s].aim.x, y: opt[s].aim.y, color: STRAT_META[s].color, label: STRAT_META[s].label[0],
  }));

  const aimDesc = (() => {
    const { x, y } = focus.aim;
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
            <div className="space-y-1.5"><Label>Firmness</Label><Chips options={FIRMNESS_ORDER} value={firmness} onChange={(v) => setFirmness(v as Firmness)} /></div>
            <div className="space-y-1.5">
              <Label>Green speed</Label>
              <Chips options={GREEN_SPEEDS.map((s) => s.label)} value={GREEN_SPEEDS.find((s) => s.stimp === stimp)?.label ?? 'Standard'}
                onChange={(v) => setStimp(GREEN_SPEEDS.find((s) => s.label === v)?.stimp ?? 10)} />
              <p className="text-[11px] text-muted-foreground">Stimp {stimp.toFixed(1)}</p>
            </div>
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
                <label className="space-y-1"><span className="text-muted-foreground">SG: Around-grn /rd</span>
                  <input type="number" step="0.1" value={profile.sgArg} onChange={(e) => setProfile({ sgArg: +e.target.value || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1" /></label>
                <label className="space-y-1"><span className="text-muted-foreground">SG: Putting /rd</span>
                  <input type="number" step="0.1" value={profile.sgPutting} onChange={(e) => setProfile({ sgPutting: +e.target.value || 0 })} className="w-full rounded-md border border-input bg-background px-2 py-1" /></label>
              </div>
              <p className="text-[11px] text-muted-foreground">0 = PGA-Tour average. Positive = better than tour (lowers ES on chips ≤55 yd and putts).</p>
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
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          {/* Three optimizers — the signature CADD-AI output. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {(['aggressive', 'optimal', 'safe'] as Strategy[]).map((s) => {
              const a = opt[s]; const meta = STRAT_META[s]; const active = strategy === s;
              return (
                <button key={s} onClick={() => setStrategy(s)}
                  className={`rounded-lg border p-4 text-left transition-colors ${active ? 'border-current bg-current/5' : 'border-border hover:border-current/50'}`}
                  style={{ color: meta.color }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-foreground">{a.es.toFixed(2)}</div>
                  <div className="text-[11px] text-muted-foreground">risk (CVaR) {a.cvar.toFixed(2)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{meta.blurb}</div>
                </button>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Expected Strokes Surface</CardTitle>
              <CardDescription>Heatmap = expected strokes by aim point (blue = best). Three optimizers are marked; the white crosshair is the selected <span style={{ color: STRAT_META[strategy].color }}>{STRAT_META[strategy].label}</span> target, {aimDesc} (vs {opt.pinES.toFixed(2)} aiming at the pin).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[360px_1fr]">
                <div className="aspect-square w-full max-w-[360px]">
                  <GreenMap model={model} aim={focus.aim} landings={focus.result.landings} surface={opt.surface} markers={markers} />
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
                        <span className="text-muted-foreground">{Math.round(focus.result.breakdown[o] * 100)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full" style={{ width: `${focus.result.breakdown[o] * 100}%`, background: OUT_COLOR[o] }} />
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
