import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Representative tour strokes-gained / distance benchmarks.
const TOURS: Record<string, { driving: number; sgApp: number; sgPutt: number; sgOtt: number }> = {
  'PGA Tour': { driving: 299, sgApp: 0.0, sgPutt: 0.0, sgOtt: 0.0 },
  'LPGA Tour': { driving: 256, sgApp: 0.0, sgPutt: 0.0, sgOtt: 0.0 },
};

const SAMPLE = [
  { skill: 'Driving Distance', you: 278, tour: 299 },
  { skill: 'SG: Off-the-Tee', you: 0.4, tour: 0.0 },
  { skill: 'SG: Approach', you: 0.6, tour: 0.0 },
  { skill: 'SG: Around-Green', you: 0.1, tour: 0.0 },
  { skill: 'SG: Putting', you: 0.1, tour: 0.0 },
];

export default function Rankings() {
  const [tour, setTour] = useState('PGA Tour');
  // The selected tour drives the driving-distance baseline (SG categories are
  // defined relative to each tour's average, so their baseline is 0).
  const data = useMemo(
    () => SAMPLE.map((r) => (r.skill === 'Driving Distance' ? { ...r, tour: TOURS[tour].driving } : r)),
    [tour],
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Rankings</h1>
        <p className="text-muted-foreground">Benchmark your game against tour baselines.</p>
      </div>

      <div className="flex gap-2">
        {Object.keys(TOURS).map((t) => (
          <button key={t} onClick={() => setTour(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              tour === t ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>You vs {tour}</CardTitle>
          <CardDescription>Strokes-gained categories (vs baseline) and driving distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="skill" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} interval={0} angle={-12} dy={8} height={50} />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="you" fill="hsl(159 88% 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tour" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" /> You</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: 'var(--muted-foreground)' }} /> {tour}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
