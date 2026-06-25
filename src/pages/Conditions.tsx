import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/input';

const SPEEDS = ['Very Slow', 'Slow', 'Standard', 'Fast', 'Very Fast'];
const FIRMNESS = ['Soft', 'Medium', 'Firm', 'Very Firm'];

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
  const [speed, setSpeed] = useState('Standard');
  const [firmness, setFirmness] = useState('Medium');
  const [stimp, setStimp] = useState(10);
  const [slope, setSlope] = useState(2);

  // Simple roll/landing model from conditions.
  const rollYds = useMemo(() => {
    const firmFactor = { Soft: 1, Medium: 3, Firm: 6, 'Very Firm': 10 }[firmness] ?? 3;
    return firmFactor;
  }, [firmness]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Course Conditions</h1>
        <p className="text-muted-foreground">Condition modifiers feed the expected-strokes model.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Green Speed</CardTitle><CardDescription>Stimpmeter & roll condition.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Segmented options={SPEEDS} value={speed} onChange={setSpeed} />
            <div className="space-y-1.5">
              <Label>Stimp reading: <span className="font-semibold text-foreground">{stimp.toFixed(1)}</span></Label>
              <input type="range" min={6} max={15} step={0.5} value={stimp} onChange={(e) => setStimp(+e.target.value)} className="w-full accent-[hsl(159_88%_45%)]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Firmness</CardTitle><CardDescription>Affects landing & rollout.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Segmented options={FIRMNESS} value={firmness} onChange={setFirmness} />
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated rollout</span><span className="font-semibold">+{rollYds} yd</span></div>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Rollout</span><span className="font-semibold">+{rollYds} yd</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Slope severity</span><span className="font-semibold">{slope}/5</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
