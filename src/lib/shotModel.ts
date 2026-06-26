// Monte-Carlo shot model + aim optimizer.
//
// Pin is at the origin (0,0): x = lateral (yards, + right), y = depth (yards,
// + long). A shot is aimed at point `aim` and lands with a 2D Gaussian spread
// (offline σ, depth σ). We classify each landing point against a simple green /
// hazard model, look up expected strokes to hole out from there, and average.
// Optimizing the aim over a grid demonstrates "centering your dispersion" —
// aiming off the pin to the fat side when trouble guards it.

import { expectedStrokesAt, type Division, type ShortGame } from './expectedStrokes';

export type GreenModel = {
  greenRadius: number;          // yards
  greenCenter: { x: number; y: number }; // pin offset within green (pin at origin)
  bunker?: { x: number; y: number; r: number } | null;
  water?: { side: 'L' | 'R' | 'long' | 'short'; line: number } | null; // half-plane
  penaltyStrokes: number;       // strokes added for finding water/OB
  slopeSeverity?: number;       // green slope 0..5 — harder putts
  division?: Division;          // player population for the ES model (default PGA Tour)
  shortGame?: ShortGame;        // strokes-gained skill (default = tour average)
};

// Wind effect applied to a shot: a mean landing push (yards) plus a dispersion
// multiplier. Produced by playing.ts (shotConditions).
export type Wind = { driftX?: number; driftY?: number; widen?: number };

export type Outcome = 'green' | 'rough' | 'sand' | 'water';

export function classify(p: { x: number; y: number }, g: GreenModel): { outcome: Outcome; remYds: number } {
  const remYds = Math.hypot(p.x, p.y); // distance from pin
  if (g.water) {
    const inWater =
      (g.water.side === 'L' && p.x < -g.water.line) ||
      (g.water.side === 'R' && p.x > g.water.line) ||
      (g.water.side === 'long' && p.y > g.water.line) ||
      (g.water.side === 'short' && p.y < -g.water.line);
    if (inWater) return { outcome: 'water', remYds };
  }
  if (g.bunker && Math.hypot(p.x - g.bunker.x, p.y - g.bunker.y) <= g.bunker.r) {
    return { outcome: 'sand', remYds };
  }
  const onGreen = Math.hypot(p.x - g.greenCenter.x, p.y - g.greenCenter.y) <= g.greenRadius;
  return { outcome: onGreen ? 'green' : 'rough', remYds };
}

function strokesFrom(outcome: Outcome, remYds: number, g: GreenModel): number {
  const div = g.division || 'pga-tour';
  const sg = g.shortGame;
  if (outcome === 'green') {
    const slopeFactor = 1 + (g.slopeSeverity || 0) * 0.03; // steeper greens → harder putts
    return expectedStrokesAt(remYds, 'green', div, sg) * slopeFactor; // green model is in yards
  }
  if (outcome === 'water') return g.penaltyStrokes + expectedStrokesAt(remYds, 'rough', div, sg);
  return expectedStrokesAt(remYds, outcome === 'sand' ? 'sand' : 'rough', div, sg);
}

// Standard-normal samples, generated once and reused across every aim so the
// optimization compares aims on identical "shots" (variance reduction).
export function makeSamples(n: number): { zx: number; zy: number }[] {
  const out: { zx: number; zy: number }[] = [];
  // Deterministic-ish but varied: Box–Muller seeded by index.
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) {
    let u = rand(), v = rand();
    if (u < 1e-9) u = 1e-9;
    out.push({ zx: Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), zy: Math.sqrt(-2 * Math.log(u)) * Math.sin(2 * Math.PI * v) });
  }
  return out;
}

export type SimResult = {
  es: number;
  breakdown: Record<Outcome, number>; // fractions 0..1
  landings: { x: number; y: number; outcome: Outcome }[];
};

export function simulate(
  aim: { x: number; y: number },
  offlineSD: number,
  depthSD: number,
  g: GreenModel,
  samples: { zx: number; zy: number }[],
  keepLandings = false,
  wind: Wind = {},
): SimResult {
  let total = 0;
  const counts: Record<Outcome, number> = { green: 0, rough: 0, sand: 0, water: 0 };
  const landings: SimResult['landings'] = [];
  const wx = wind.driftX || 0, wy = wind.driftY || 0, mul = wind.widen || 1;
  for (const s of samples) {
    const p = { x: aim.x + s.zx * offlineSD * mul + wx, y: aim.y + s.zy * depthSD * mul + wy };
    const { outcome, remYds } = classify(p, g);
    counts[outcome]++;
    total += 1 + strokesFrom(outcome, remYds, g); // +1 for this shot
    if (keepLandings) landings.push({ ...p, outcome });
  }
  const n = samples.length;
  return {
    es: total / n,
    breakdown: { green: counts.green / n, rough: counts.rough / n, sand: counts.sand / n, water: counts.water / n },
    landings,
  };
}

// Per-sample expected strokes for one aim (used by the multi-strategy optimizer).
function sampleES(
  aim: { x: number; y: number }, offlineSD: number, depthSD: number,
  g: GreenModel, samples: { zx: number; zy: number }[], wind: Wind,
): number[] {
  const wx = wind.driftX || 0, wy = wind.driftY || 0, mul = wind.widen || 1;
  const out = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const p = { x: aim.x + s.zx * offlineSD * mul + wx, y: aim.y + s.zy * depthSD * mul + wy };
    const { outcome, remYds } = classify(p, g);
    out[i] = 1 + strokesFrom(outcome, remYds, g);
  }
  return out;
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
// CVaR@30%: mean of the worst (highest) 30% of outcomes — the risk-averse score.
function cvar30(sortedAsc: number[]): number {
  const k = Math.max(1, Math.ceil(sortedAsc.length * 0.3));
  let s = 0;
  for (let i = sortedAsc.length - k; i < sortedAsc.length; i++) s += sortedAsc[i];
  return s / k;
}
// Aggressive upside: average amount by which samples beat the optimal mean N.
function upside(samp: number[], N: number): number {
  let s = 0;
  for (const e of samp) if (e < N) s += N - e;
  return s / samp.length;
}

export type OptResult = {
  best: { x: number; y: number };
  bestES: number;
  pinES: number;          // ES when aiming straight at the pin
  saved: number;          // pinES - bestES
  result: SimResult;      // full sim (with landings) at best aim
  surface: { x: number; y: number; es: number }[]; // ES over the aim grid (heatmap)
};

export type Strategy = 'optimal' | 'aggressive' | 'safe';
export type StrategyAim = {
  strategy: Strategy;
  aim: { x: number; y: number };
  es: number;             // mean ES at this aim
  cvar: number;           // CVaR@30% (risk) at this aim
  result: SimResult;      // full sim (with landings) at this aim
};
export type OptStrategies = {
  optimal: StrategyAim;
  aggressive: StrategyAim;
  safe: StrategyAim;
  pinES: number;
  surface: { x: number; y: number; es: number }[];
};

// The real CADD-AI "three optimizers": optimal (min mean ES), aggressive (max
// average upside vs the optimal mean), and safe (min CVaR@30%). All three are
// chosen from the same aim grid evaluated on one shared sample set.
export function optimizeStrategies(offlineSD: number, depthSD: number, g: GreenModel, nSamples = 500, wind: Wind = {}): OptStrategies {
  const samples = makeSamples(nSamples);
  const pinES = mean(sampleES({ x: 0, y: 0 }, offlineSD, depthSD, g, samples, wind));

  type Cell = { aim: { x: number; y: number }; m: number; sorted: number[] };
  const cells: Cell[] = [];
  const surface: { x: number; y: number; es: number }[] = [];
  for (let ax = -22; ax <= 22; ax += 2) {
    for (let ay = -16; ay <= 16; ay += 2) {
      const aim = { x: ax, y: ay };
      const es = sampleES(aim, offlineSD, depthSD, g, samples, wind);
      const m = mean(es);
      cells.push({ aim, m, sorted: es.slice().sort((a, b) => a - b) });
      surface.push({ x: ax, y: ay, es: m });
    }
  }

  // optimal = min mean; N anchors the aggressive upside score.
  let opt = cells[0];
  for (const c of cells) if (c.m < opt.m) opt = c;
  const N = opt.m;
  // aggressive = max upside vs N.
  let agg = cells[0]; let aggScore = -Infinity;
  for (const c of cells) { const u = upside(c.sorted, N); if (u > aggScore) { aggScore = u; agg = c; } }
  // safe = min CVaR@30%.
  let safe = cells[0]; let safeScore = Infinity;
  for (const c of cells) { const v = cvar30(c.sorted); if (v < safeScore) { safeScore = v; safe = c; } }

  const make = (c: Cell, strategy: Strategy): StrategyAim => ({
    strategy, aim: c.aim, es: c.m, cvar: cvar30(c.sorted),
    result: simulate(c.aim, offlineSD, depthSD, g, samples, true, wind),
  });
  return { optimal: make(opt, 'optimal'), aggressive: make(agg, 'aggressive'), safe: make(safe, 'safe'), pinES, surface };
}

export function optimizeAim(offlineSD: number, depthSD: number, g: GreenModel, nSamples = 600, wind: Wind = {}): OptResult {
  const samples = makeSamples(nSamples);
  const pinES = simulate({ x: 0, y: 0 }, offlineSD, depthSD, g, samples, false, wind).es;
  let best = { x: 0, y: 0 };
  let bestES = Infinity;
  const surface: { x: number; y: number; es: number }[] = [];
  for (let ax = -22; ax <= 22; ax += 2) {
    for (let ay = -16; ay <= 16; ay += 2) {
      const es = simulate({ x: ax, y: ay }, offlineSD, depthSD, g, samples, false, wind).es;
      surface.push({ x: ax, y: ay, es });
      if (es < bestES) { bestES = es; best = { x: ax, y: ay }; }
    }
  }
  const result = simulate(best, offlineSD, depthSD, g, samples, true, wind);
  return { best, bestES, pinES, saved: pinES - bestES, result, surface };
}
