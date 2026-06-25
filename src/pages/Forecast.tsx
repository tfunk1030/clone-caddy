import { useState } from 'react';
import { Wind, Thermometer, Droplets, Mountain, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Forecast() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setStatus('Fetching conditions…');
    setData(null);
    try {
      const r = await fetch(`/api/conditions?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Request failed');
      setData(d);
      setStatus('');
    } catch (e: any) {
      setStatus(`Could not load conditions: ${e.message}`);
    }
  };

  const w = data?.weather, adj = data?.adjustment;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Wind & Forecast</h1>
        <p className="text-muted-foreground">Live weather and an altitude/temperature carry adjustment.</p>
      </div>

      <form onSubmit={go} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Course or city (e.g. Pebble Beach)" />
        <Button type="submit"><Search className="mr-1 h-4 w-4" /> Check</Button>
      </form>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}

      {data && (
        <>
          <p className="text-sm text-muted-foreground">📍 {data.location?.name}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Thermometer, label: 'Temp', value: w.tempF != null ? `${Math.round(w.tempF)}°F` : '—' },
              { icon: Wind, label: 'Wind', value: w.windMph != null ? `${Math.round(w.windMph)} mph ${w.windFrom || ''}` : '—' },
              { icon: Droplets, label: 'Humidity', value: w.humidityPct != null ? `${Math.round(w.humidityPct)}%` : '—' },
              { icon: Mountain, label: 'Elevation', value: `${adj.elevationFt.toLocaleString()} ft` },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</span>
                    <m.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold">{m.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Carry adjustment</CardTitle></CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold text-primary">
                {adj.totalPct >= 0 ? '+' : ''}{adj.totalPct}%
              </div>
              <p className="text-sm text-muted-foreground">
                altitude {adj.altitudePct >= 0 ? '+' : ''}{adj.altitudePct}%, temp {adj.tempPct >= 0 ? '+' : ''}{adj.tempPct}%
              </p>
              <p className="mt-2 text-lg">A 150 yd shot plays like <span className="font-bold">{adj.playsLike150} yd</span>.</p>
              <p className="mt-2 text-xs text-muted-foreground">{adj.note}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
