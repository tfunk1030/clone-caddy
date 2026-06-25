import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { GreenMap } from '@/components/GreenMap';
import { optimizeAim, type GreenModel } from '@/lib/shotModel';
import { ES_NOTE } from '@/lib/expectedStrokes';
import { useProfile } from '@/context/ProfileContext';

const PINS: Record<string, { x: number; y: number }> = {
  Center: { x: 0, y: 0 },
  'Tucked Left': { x: 8, y: 0 },
  'Tucked Right': { x: -8, y: 0 },
  Front: { x: 0, y: 8 },
  Back: { x: 0, y: -8 },
};
const WATERS: Record<string, GreenModel['water']> = {
  None: null,
  Left: { side: 'L', line: 5 },
  Right: { side: 'R', line: 5 },
  Long: { side: 'long', line: 6 },
  Short: { side: 'short', line: 6 },
};

const OUT_COLOR: Record<string, string> = { green: '#37c871', rough: '#5b6b78', sand: '#f5e08a', water: '#3b82f6' };

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            value === o ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}>{o}</button>
      ))}
    </div>
  );
}

export default function ExpectedStrokes() {
  // Dispersion comes from the shared player profile (also set on the Dispersion page).
  const { profile, setProfile } = useProfile();
  const { offlineSD, depthSD } = profile;
  const setOfflineSD = (v: number) => setProfile({ offlineSD: v });
  const setDepthSD = (v: number) => setProfile({ depthSD: v });
  const [greenRadius, setGreenRadius] = useState(15);
  const [pin, setPin] = useState('Tucked Left');
  const [water, setWater] = useState('Left');
  const [bunker, setBunker] = useState(true);

  const model: GreenModel = useMemo(() => ({
    greenRadius,
    greenCenter: PINS[pin],
    water: WATERS[water],
    bunker: bunker ? { x: -10, y: -10, r: 6 } : null,
    penaltyStrokes: 1,
  }), [greenRadius, pin, water, bunker]);

  const opt = useMemo(() => optimizeAim(offlineSD, depthSD, model, 700), [offlineSD, depthSD, model]);

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
        <p className="text-muted-foreground">Optimize your aim point — center your dispersion, your misses are part of the math.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader><CardTitle>Shot &amp; hole</CardTitle><CardDescription>Approach to the green.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Offline spread σ: <span className="font-semibold text-foreground">{offlineSD} yd</span></Label>
              <input type="range" min={3} max={18} value={offlineSD} onChange={(e) => setOfflineSD(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5">
              <Label>Depth spread σ: <span className="font-semibold text-foreground">{depthSD} yd</span></Label>
              <input type="range" min={3} max={18} value={depthSD} onChange={(e) => setDepthSD(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5">
              <Label>Green radius: <span className="font-semibold text-foreground">{greenRadius} yd</span></Label>
              <input type="range" min={8} max={24} value={greenRadius} onChange={(e) => setGreenRadius(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
            <div className="space-y-1.5"><Label>Pin position</Label><Chips options={Object.keys(PINS)} value={pin} onChange={setPin} /></div>
            <div className="space-y-1.5"><Label>Water</Label><Chips options={Object.keys(WATERS)} value={water} onChange={setWater} /></div>
            <div className="space-y-1.5"><Label>Greenside bunker</Label><Chips options={['On', 'Off']} value={bunker ? 'On' : 'Off'} onChange={(v) => setBunker(v === 'On')} /></div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">ES Remaining (optimal)</div>
              <div className="mt-1 font-display text-3xl font-bold text-primary">{opt.bestES.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">aim {aimDesc}</div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Aiming at pin</div>
              <div className="mt-1 font-display text-3xl font-bold">{opt.pinES.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">naive strategy</div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Strokes saved</div>
              <div className={`mt-1 font-display text-3xl font-bold ${opt.saved > 0.005 ? 'text-primary' : ''}`}>
                {opt.saved >= 0 ? '−' : '+'}{Math.abs(opt.saved).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">per shot vs aiming at pin</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Dispersion vs the green</CardTitle><CardDescription>700 simulated shots at the optimal aim (white +). Pin is red.</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[360px_1fr]">
                <div className="aspect-square w-full max-w-[360px]">
                  <GreenMap model={model} aim={opt.best} landings={opt.result.landings} />
                </div>
                <div className="space-y-3">
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
                  <p className="pt-2 text-xs text-muted-foreground">{ES_NOTE}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
