import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import CourseNavigation from '@/pages/CourseNavigation';

// Tournament has two views: per-hole Strategy (build/save on the satellite map
// under tournament conditions) and the Leaderboard.
export default function Tournament() {
  const [view, setView] = useState<'strategy' | 'leaderboard'>('strategy');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
        <span className="mr-1 font-display text-sm font-bold tracking-wide">Tournament</span>
        {(['strategy', 'leaderboard'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${view === v ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {v}
          </button>
        ))}
      </div>
      {view === 'strategy'
        ? <div className="min-h-0 flex-1"><CourseNavigation mode="tournament" /></div>
        : <div className="min-h-0 flex-1 overflow-auto"><Leaderboard /></div>}
    </div>
  );
}

// A tournament leaderboard. A demo field plays a 4-round event; your own score
// comes from the most recent round you logged on the Play tab (localStorage),
// projected across the remaining rounds so you appear live on the board.

type Entry = { name: string; rounds: number[]; you?: boolean };
const FIELD: Entry[] = [
  { name: 'S. Scheffler', rounds: [66, 68, 67, 69] },
  { name: 'R. McIlroy', rounds: [67, 69, 66, 68] },
  { name: 'J. Rahm', rounds: [68, 67, 70, 67] },
  { name: 'X. Schauffele', rounds: [69, 68, 68, 68] },
  { name: 'C. Morikawa', rounds: [70, 67, 69, 69] },
  { name: 'V. Hovland', rounds: [68, 71, 68, 70] },
  { name: 'L. Åberg', rounds: [71, 69, 70, 68] },
  { name: 'B. DeChambeau', rounds: [67, 72, 69, 71] },
  { name: 'P. Cantlay', rounds: [70, 70, 71, 69] },
  { name: 'T. Fleetwood', rounds: [72, 70, 69, 70] },
];
const COURSE_PAR = 72;

function readYourRound(): { score: number; played: number } | null {
  try {
    const s = localStorage.getItem('caddai.round');
    if (!s) return null;
    const rows = JSON.parse(s) as { par: number; score: number | '' }[];
    let score = 0, played = 0, par = 0;
    for (const r of rows) { if (r.score === '' || r.score == null) continue; played++; score += Number(r.score); par += r.par; }
    return played ? { score: score + (COURSE_PAR - par > 0 ? 0 : 0), played } : null;
  } catch { return null; }
}

function Leaderboard() {
  const { user } = useAuth();
  const [round, setRound] = useState(2); // through which round to show
  const your = readYourRound();

  const board = useMemo(() => {
    const field: Entry[] = [...FIELD];
    if (your) {
      // Project your logged 18 holes to a per-round score, repeated across rounds.
      const per = your.played >= 18 ? your.score : Math.round((your.score / your.played) * 18);
      field.push({ name: (user?.email?.split('@')[0] || 'You'), rounds: [per, per, per, per], you: true });
    }
    return field
      .map((e) => {
        const played = e.rounds.slice(0, round);
        const total = played.reduce((a, b) => a + b, 0);
        const toPar = total - COURSE_PAR * played.length;
        return { ...e, total, toPar, thru: played.length };
      })
      .sort((a, b) => a.toPar - b.toPar);
  }, [round, your, user]);

  const fmt = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Tournament</h1>
        <p className="text-muted-foreground">Leaderboard · par {COURSE_PAR} · log a round on Play to join the field.</p>
      </div>

      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((r) => (
          <button key={r} onClick={() => setRound(r)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${round === r ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            Round {r}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Leaderboard</CardTitle><CardDescription>Through round {round}.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3">Pos</th><th className="pr-3">Player</th><th className="pr-3">To Par</th><th className="pr-3">Thru</th><th>Total</th>
            </tr></thead>
            <tbody>
              {board.map((e, i) => (
                <tr key={e.name} className={`border-t border-border ${e.you ? 'bg-primary/10 font-semibold' : ''}`}>
                  <td className="py-1.5 pr-3">{i + 1}{i === 0 ? '' : ''}</td>
                  <td className="pr-3">{e.name}{e.you ? ' (you)' : ''}</td>
                  <td className={`pr-3 ${e.toPar < 0 ? 'text-red-500' : ''}`}>{fmt(e.toPar)}</td>
                  <td className="pr-3 text-muted-foreground">R{e.thru}</td>
                  <td>{e.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!your && <p className="pt-3 text-xs text-muted-foreground">No logged round yet — enter scores on the Play tab to appear on the board.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
