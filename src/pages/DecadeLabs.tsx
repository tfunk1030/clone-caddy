import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GreenMap } from '@/components/GreenMap';
import { optimizeStrategies, type GreenModel, type Strategy } from '@/lib/shotModel';
import { buildBag, recommendClub } from '@/lib/clubs';
import { shotConditions } from '@/lib/playing';
import { useProfile } from '@/context/ProfileContext';

// DECADE Labs: disciplined target selection. Each scenario is a real trade-off
// (tucked pin, water, short-siding). We run the three optimizers and teach why
// the optimal/safe target sits off the flag — centering your dispersion on the
// fat side, the core DECADE principle.

type Scenario = {
  id: string; title: string; distance: number; lesson: string;
  model: Omit<GreenModel, 'division' | 'shortGame'>;
};
const SCENARIOS: Scenario[] = [
  {
    id: 'water-right', title: 'Tucked pin, water right', distance: 175,
    lesson: 'The pin is cut just left of water. Aiming at it brings the penalty into your dispersion. The disciplined target is the fat of the green left — you give up a few birdie looks to erase the big number.',
    model: { greenRadius: 15, greenCenter: { x: 8, y: 0 }, water: { side: 'R', line: 4 }, bunker: null, penaltyStrokes: 1, slopeSeverity: 2 },
  },
  {
    id: 'short-side-bunker', title: 'Short-side bunker', distance: 140,
    lesson: 'A greenside bunker guards the short side. Missing at the flag short-sides you; aiming to the center leaves an easier two-putt and takes the bunker out of play.',
    model: { greenRadius: 14, greenCenter: { x: -7, y: -2 }, water: null, bunker: { x: 9, y: -8, r: 6 }, penaltyStrokes: 1, slopeSeverity: 2 },
  },
  {
    id: 'front-pin-back-trouble', title: 'Front pin, trouble long', distance: 195,
    lesson: 'Pin is front with a steep fall-off long. Long-distance approaches disperse most in depth — bias your target short of center so the long misses still find putting surface.',
    model: { greenRadius: 16, greenCenter: { x: 0, y: -8 }, water: { side: 'long', line: 6 }, bunker: null, penaltyStrokes: 1, slopeSeverity: 3 },
  },
  {
    id: 'open-green', title: 'Open green, central pin', distance: 150,
    lesson: 'No trouble near the flag. With nothing to avoid, the optimal and aggressive targets converge near the pin — this is when you fire.',
    model: { greenRadius: 16, greenCenter: { x: 0, y: 0 }, water: null, bunker: null, penaltyStrokes: 1, slopeSeverity: 1 },
  },
];

const STRAT = { aggressive: { label: 'Aggressive', color: '#ef4444' }, optimal: { label: 'Optimal', color: '#10d98a' }, safe: { label: 'Safe', color: '#3b82f6' } };

export default function DecadeLabs() {
  const { profile } = useProfile();
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [strategy, setStrategy] = useState<Strategy>('optimal');
  const s = SCENARIOS.find((x) => x.id === scenarioId)!;

  const bag = useMemo(() => buildBag(profile.drivingDistance, profile.offlineSD, profile.depthSD), [profile.drivingDistance, profile.offlineSD, profile.depthSD]);
  const club = useMemo(() => recommendClub(bag, shotConditions(s.distance).playsLike), [bag, s.distance]);
  const model: GreenModel = useMemo(() => ({ ...s.model, division: profile.division, shortGame: { sgArg: profile.sgArg, sgPutting: profile.sgPutting } }),
    [s, profile.division, profile.sgArg, profile.sgPutting]);
  const opt = useMemo(() => optimizeStrategies(club.offlineSD, club.depthSD, model, 500), [club, model]);
  const focus = opt[strategy];
  const markers = (['aggressive', 'optimal', 'safe'] as Strategy[]).map((k) => ({ x: opt[k].aim.x, y: opt[k].aim.y, color: STRAT[k].color, label: STRAT[k].label[0] }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">DECADE Labs</h1>
        <p className="text-muted-foreground">Disciplined target selection — practice centering your dispersion on the fat side.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {SCENARIOS.map((x) => (
            <button key={x.id} onClick={() => setScenarioId(x.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${x.id === scenarioId ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
              <div className="text-sm font-semibold">{x.title}</div>
              <div className="text-[11px] text-muted-foreground">{x.distance} yd · {recommendClub(bag, shotConditions(x.distance).playsLike).name}</div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(['aggressive', 'optimal', 'safe'] as Strategy[]).map((k) => (
              <button key={k} onClick={() => setStrategy(k)}
                className={`rounded-lg border p-3 text-left transition-colors ${strategy === k ? 'border-current bg-current/5' : 'border-border'}`} style={{ color: STRAT[k].color }}>
                <div className="text-xs font-semibold uppercase tracking-wide">{STRAT[k].label}</div>
                <div className="mt-1 font-display text-xl font-bold text-foreground">{opt[k].es.toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground">risk {opt[k].cvar.toFixed(2)}</div>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>{s.title}</CardTitle><CardDescription>{s.distance} yd · {club.name} · σ {club.offlineSD}/{club.depthSD} yd</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[320px_1fr]">
                <div className="aspect-square w-full max-w-[320px]">
                  <GreenMap model={model} aim={focus.aim} landings={focus.result.landings} surface={opt.surface} markers={markers} />
                </div>
                <div className="space-y-3 text-sm">
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="mb-1 font-semibold" style={{ color: STRAT[strategy].color }}>{STRAT[strategy].label} target</div>
                    <p className="text-muted-foreground">{s.lesson}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Aggressive vs Safe saves {(opt.aggressive.cvar - opt.safe.cvar).toFixed(2)} strokes of downside risk for {(opt.safe.es - opt.aggressive.es).toFixed(2)} of average score — the trade-off DECADE trains you to make deliberately.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
