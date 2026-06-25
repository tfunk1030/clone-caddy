import { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useProfile } from '@/context/ProfileContext';

// Box–Muller normal sample
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export default function Dispersion() {
  const [carry, setCarry] = useState(160);
  // Dispersion is the shared player profile — it flows into Expected Strokes and per-hole strategy.
  const { profile, setProfile } = useProfile();
  const { offlineSD, depthSD } = profile;

  const points = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 220; i++) pts.push({ x: randn() * offlineSD, y: carry + randn() * depthSD });
    return pts;
  }, [carry, depthSD, offlineSD]);

  const ovalW = (offlineSD * 2).toFixed(1);
  const ovalD = (depthSD * 2).toFixed(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Dispersion</h1>
        <p className="text-muted-foreground">Center your dispersion — your misses are part of the math.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader><CardTitle>Shot pattern</CardTitle><CardDescription>Tune your two-sigma oval.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Carry distance (yd)</Label>
              <Input type="number" value={carry} onChange={(e) => setCarry(+e.target.value || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Depth spread ± (1σ, yd)</Label>
              <Input type="number" value={depthSD} onChange={(e) => setProfile({ depthSD: +e.target.value || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Offline spread ± (1σ, yd)</Label>
              <Input type="number" value={offlineSD} onChange={(e) => setProfile({ offlineSD: +e.target.value || 0 })} />
            </div>
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">2σ width</span><span className="font-semibold">{ovalW} yd</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">2σ depth</span><span className="font-semibold">{ovalD} yd</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2D scatter (yards)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[460px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis type="number" dataKey="x" name="offline" unit="yd" stroke="var(--muted-foreground)"
                    domain={[-Math.max(25, offlineSD * 3), Math.max(25, offlineSD * 3)]} />
                  <YAxis type="number" dataKey="y" name="carry" unit="yd" stroke="var(--muted-foreground)"
                    domain={[carry - Math.max(25, depthSD * 3), carry + Math.max(25, depthSD * 3)]} />
                  <ZAxis range={[18, 18]} />
                  <ReferenceLine x={0} stroke="var(--primary)" strokeDasharray="4 4" />
                  <Scatter data={points} fill="hsl(159 88% 45%)" fillOpacity={0.5} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
