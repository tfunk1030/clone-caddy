import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Map, TrendingUp, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const PRESETS = ['Standard', 'Elite Am', 'Tiger Five', 'Tournament', 'Aggressive', 'Recovery'];
const KPIS = [
  { label: 'Expected Strokes / round', value: '71.4', icon: Flag, sub: '−0.6 vs scratch' },
  { label: 'Strokes Gained: Total', value: '+1.2', icon: TrendingUp, sub: 'last 5 rounds' },
  { label: 'Driving Distance', value: '278 yd', icon: Target, sub: 'carry, avg' },
  { label: 'Courses analyzed', value: '12', icon: Map, sub: '3 LiDAR-enhanced' },
];
const COACHING = [
  'Your misses are part of the math.',
  'As far as you can on that line.',
  'You should be disappointed with par.',
];

export default function Dashboard() {
  const { user } = useAuth();
  const [preset, setPreset] = useState('Standard');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="text-muted-foreground">Pick up where you left off, or analyze a new course.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
                <k.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 font-display text-3xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Strategy preset</CardTitle>
            <CardDescription>How aggressively to optimize aim points and target selection.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    preset === p
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild><Link to="/app/course">Open course map →</Link></Button>
              <Button variant="outline" asChild><Link to="/app/dispersion">Center your dispersion</Link></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>From your coach</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {COACHING.map((c) => (
              <p key={c} className="border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">“{c}”</p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
