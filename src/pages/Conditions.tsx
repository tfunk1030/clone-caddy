import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import {
  GREEN_SPEEDS, FIRMNESS_ORDER, ROLLOUT_FRACTION, COURSE_CONDITIONS, stimpPuttFactor, type Firmness,
} from '@/lib/conditions';

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            value === o ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export default function Conditions() {
  const [stimp, setStimp] = useState(10);
  const [firmness, setFirmness] = useState<Firmness>('Medium');
  const [slope, setSlope] = useState(2);

  const speed = GREEN_SPEEDS.find((s) => s.stimp === stimp)?.label ?? 'Custom';
  // Rollout at a 150-yd reference shot (the real engine's firmness fractions × 18 yd).
  const rollYds = useMemo(() => +(ROLLOUT_FRACTION[firmness] * 18).toFixed(1), [firmness]);
  const puttFactor = stimpPuttFactor(stimp);
  const activePreset = COURSE_CONDITIONS.find((c) => c.firmness === firmness && c.stimp === stimp)?.id ?? '';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Course Conditions</h1>
        <p className="text-muted-foreground">Condition modifiers feed the expected-strokes model.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Course setup</CardTitle><CardDescription>One-click presets (firmness + green speed), matching CADD-AI.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-4">
            {COURSE_CONDITIONS.map((c) => (
              <button key={c.id} onClick={() => { setFirmness(c.firmness); setStimp(c.stimp); }}
                className={`rounded-lg border p-3 text-left transition-colors ${activePreset === c.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{c.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Green Speed</CardTitle><CardDescription>Stimpmeter reading.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Segmented options={GREEN_SPEEDS.map((s) => s.label)} value={speed}
              onChange={(v) => setStimp(GREEN_SPEEDS.find((s) => s.label === v)?.stimp ?? 10)} />
            <div className="space-y-1.5">
              <Label>Stimp reading: <span className="font-semibold text-foreground">{stimp.toFixed(1)}</span></Label>
              <input type="range" min={6} max={15} step={0.5} value={stimp} onChange={(e) => setStimp(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
              <p className="text-xs text-muted-foreground">Putting difficulty ×{puttFactor.toFixed(2)} vs standard.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Firmness</CardTitle><CardDescription>Affects landing & rollout.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Segmented options={FIRMNESS_ORDER} value={firmness} onChange={(v) => setFirmness(v as Firmness)} />
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated rollout (150 yd)</span><span className="font-semibold">+{rollYds} yd</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Green slope severity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label>Severity: <span className="font-semibold text-foreground">{slope}/5</span></Label>
            <input type="range" min={0} max={5} step={1} value={slope} onChange={(e) => setSlope(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            <p className="text-xs text-muted-foreground">Higher severity widens the makeable-putt zone penalty in scoring.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Green speed</span><span className="font-semibold">{speed} ({stimp.toFixed(1)})</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Firmness</span><span className="font-semibold">{firmness}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Rollout (150 yd)</span><span className="font-semibold">+{rollYds} yd</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Putting difficulty</span><span className="font-semibold">×{puttFactor.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Slope severity</span><span className="font-semibold">{slope}/5</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
