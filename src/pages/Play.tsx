import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { expectedStrokesAt } from '@/lib/expectedStrokes';
import { useProfile } from '@/context/ProfileContext';

// A round scorecard with strokes-gained vs the Expected-Strokes baseline.
// Each hole: par, score, putts, fairway hit, GIR. We estimate strokes gained
// off-the-tee+approach as the ES baseline for the hole minus your non-putt
// strokes, and SG putting from your putts vs the tour-average putts from GIR
// distance. Persisted to localStorage.

type HoleRow = { par: number; yards: number; score: number | ''; putts: number | ''; fir: boolean | null; gir: boolean };
const DEFAULT_PARS = [4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DEFAULT_YARDS = [410, 435, 540, 175, 400, 455, 165, 520, 420, 415, 445, 195, 565, 405, 430, 210, 460, 535];

const blankRound = (): HoleRow[] =>
  DEFAULT_PARS.map((par, i) => ({ par, yards: DEFAULT_YARDS[i], score: '', putts: '', fir: par === 3 ? null : false, gir: false }));

const KEY = 'caddai.round';

// Tour-average expected putts from the approach distance (proxy for GIR proximity).
function expectedPuttsForHole(yards: number, division: any): number {
  // Approx GIR proximity by hole length, then ES on the green (yards).
  const proximityFt = yards >= 450 ? 38 : yards >= 380 ? 32 : yards >= 200 ? 28 : yards >= 150 ? 24 : 18;
  return expectedStrokesAt(proximityFt / 3, 'green', division);
}

export default function Play() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<HoleRow[]>(() => {
    try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch {}
    return blankRound();
  });
  const save = (next: HoleRow[]) => { setRows(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} };
  const set = (i: number, patch: Partial<HoleRow>) => save(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const totals = useMemo(() => {
    let score = 0, par = 0, putts = 0, played = 0, firHit = 0, firTotal = 0, gir = 0;
    let sgPutt = 0, sgTeeApp = 0;
    for (const r of rows) {
      par += r.par;
      if (r.score === '' || r.score == null) continue;
      played++;
      score += Number(r.score);
      const p = r.putts === '' ? 0 : Number(r.putts);
      putts += p;
      if (r.fir === true) firHit++;
      if (r.fir !== null) firTotal++;
      if (r.gir) gir++;
      // SG putting: tour-average putts for the hole minus your putts.
      if (r.putts !== '') sgPutt += expectedPuttsForHole(r.yards, profile.division) - p;
      // SG tee-to-green: ES baseline to play the hole (from tee) minus your non-putt strokes.
      const baseline = expectedStrokesAt(r.yards, 'tee', profile.division);
      const nonPutt = Number(r.score) - p;
      sgTeeApp += (baseline - expectedPuttsForHole(r.yards, profile.division)) - nonPutt;
    }
    return {
      score, par: played ? rows.slice(0, played).reduce((a, r) => a + r.par, 0) : par, fullPar: par,
      putts, played, firPct: firTotal ? Math.round((firHit / firTotal) * 100) : 0,
      girPct: played ? Math.round((gir / played) * 100) : 0,
      sgPutt, sgTeeApp, sgTotal: sgPutt + sgTeeApp,
    };
  }, [rows, profile.division]);

  const toPar = totals.played ? totals.score - totals.par : 0;
  const fmtPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
  const fmtSg = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide">Play</h1>
          <p className="text-muted-foreground">Track a round and your strokes gained vs the {profile.division.replace('-', ' ')} baseline.</p>
        </div>
        <Button variant="outline" onClick={() => save(blankRound())}>New round</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</div>
          <div className="mt-1 font-display text-2xl font-bold">{totals.played ? totals.score : '—'} <span className="text-base font-semibold text-primary">{totals.played ? fmtPar(toPar) : ''}</span></div>
          <div className="text-xs text-muted-foreground">{totals.played}/18 holes</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Putts</div>
          <div className="mt-1 font-display text-2xl font-bold">{totals.putts || '—'}</div>
          <div className="text-xs text-muted-foreground">SG putting {fmtSg(totals.sgPutt)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">FIR / GIR</div>
          <div className="mt-1 font-display text-2xl font-bold">{totals.firPct}% / {totals.girPct}%</div>
          <div className="text-xs text-muted-foreground">fairways / greens</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Strokes gained</div>
          <div className={`mt-1 font-display text-2xl font-bold ${totals.sgTotal >= 0 ? 'text-primary' : 'text-red-500'}`}>{fmtSg(totals.sgTotal)}</div>
          <div className="text-xs text-muted-foreground">tee-grn {fmtSg(totals.sgTeeApp)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Scorecard</CardTitle><CardDescription>Enter score &amp; putts; tap fairway/green when hit.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2">Hole</th><th className="pr-2">Par</th><th className="pr-2">Yds</th>
              <th className="pr-2">Score</th><th className="pr-2">Putts</th><th className="pr-2">FIR</th><th className="pr-2">GIR</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-2 font-semibold">{i + 1}</td>
                  <td className="pr-2">
                    <select value={r.par} onChange={(e) => set(i, { par: +e.target.value, fir: +e.target.value === 3 ? null : r.fir })} className="rounded border border-input bg-background px-1.5 py-0.5">
                      {[3, 4, 5].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="pr-2"><input type="number" value={r.yards} onChange={(e) => set(i, { yards: +e.target.value || 0 })} className="w-16 rounded border border-input bg-background px-1.5 py-0.5" /></td>
                  <td className="pr-2"><input type="number" value={r.score} onChange={(e) => set(i, { score: e.target.value === '' ? '' : +e.target.value })} className="w-14 rounded border border-input bg-background px-1.5 py-0.5" /></td>
                  <td className="pr-2"><input type="number" value={r.putts} onChange={(e) => set(i, { putts: e.target.value === '' ? '' : +e.target.value })} className="w-14 rounded border border-input bg-background px-1.5 py-0.5" /></td>
                  <td className="pr-2">{r.fir === null ? <span className="text-muted-foreground">—</span> :
                    <button onClick={() => set(i, { fir: !r.fir })} className={`h-5 w-5 rounded ${r.fir ? 'bg-primary' : 'border border-input'}`} />}</td>
                  <td className="pr-2"><button onClick={() => set(i, { gir: !r.gir })} className={`h-5 w-5 rounded ${r.gir ? 'bg-primary' : 'border border-input'}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-3 text-xs text-muted-foreground">Strokes gained is an estimate from the Expected-Strokes baseline (tee-to-green vs your non-putt strokes, putting vs tour-average GIR distance), not a shot-by-shot measurement.</p>
        </CardContent>
      </Card>
    </div>
  );
}
