// Expected-strokes (strokes-to-hole-out) model.
//
// This is a faithful port of the production CADD-AI strokes-gained engine: a set
// of degree-6 polynomial fits of PGA-Tour strokes-to-hole-out vs. distance, one
// per lie, with LPGA "core shift" polynomials, smooth extrapolation past the
// observed-distance ranges, and per-division scaling (college / junior play a
// constant number of strokes worse, spread across the round).
//
// Distances are in YARDS for every lie, including the green (≈0.333 yd = 1 ft).
// `division` selects the player population; everything is anchored to PGA/LPGA
// tour baselines.

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'recovery' | 'green' | 'water';
export type Tour = 'pga' | 'lpga';
export type Division =
  | 'pga-tour' | 'lpga-tour'
  | 'mens-college' | 'womens-college'
  | 'junior-boys' | 'junior-girls';

// --- PGA-Tour baseline polynomials (coeffs[i] * distance^i), per lie ---
const PGA_FAIRWAY = [1.87505684, .0344179367, -.00056330665, 470425536e-14, -202041273e-16, 438015739e-19, -378163505e-22];
const PGA_ROUGH = [2.01325284, .0373834464, -.000608542541, 501193038e-14, -208847962e-16, 432228049e-19, -353899274e-22];
const PGA_GREEN = [.822701978, .348808959, -.0445111801, .00305771434, -.000112243654, 209685358e-14, -157305673e-16];
const PGA_TEE = [5.536339918326031, -.04509927064173024, .000249243359139872, -384958507987e-18, -49358802e-17, 1913602e-18, -1392e-18];
const PGA_SAND = [2.14601649, .0261044155, -.000269537153, 148010114e-14, -399813977e-17, 524740763e-20, -267577455e-23];
const PGA_RECOVERY = [1.34932958, .0639685426, -.00063875441, 309148159e-14, -760396073e-17, 928546297e-20, -446945896e-23];

// LPGA shift polynomials (added to the PGA baseline, in the normalized
// observed-range coordinate) and the PGA observed distance ranges per lie.
const CORE_SHIFT: Record<string, number[]> = {
  fairway: [.099475770734, -.821517457238, 4.536558720489, -3.489702141858, -1.781482402306, .571161544589, 1.079736380683],
  green: [.008370571577, -.468796400869, 2.711657662834, -4.621658818382, 1.764633722977, 2.01698254479, -1.619569548705],
  rough: [.1677862633, -1.690713669795, 8.888261194231, -9.7409699871, -1.417469357106, 3.484421472513, .918053107293],
  tee: [.171912019093, .658111240923, -2.051166154877, .020382521582, 4.651131602413, 1.57030757904, -5.547825560716],
};
const OBSERVED_RANGE: Record<string, [number, number]> = {
  fairway: [7.43, 348.9],
  green: [.333, 33.39],
  rough: [7.76, 348.9],
  tee: [140, 650],
};

// Distance constants (yards).
const MAX_D = 575;            // hard distance ceiling for extrapolated tails
const FW_MIN = 7.43, FW_MAX = 348.9;   // fairway observed range
const RO_MIN = 7.76, RO_MAX = 348.9;   // rough observed range
const GR_MIN = .333, GR_MAX = 33.39;   // green observed range (yards)
const TEE_MIN = 140;          // tee observed minimum
const TEE_BLEND_MAX = 170;    // below this a tee shot blends toward the approach value
const SAND_MIN = 7.96;        // sand short-distance floor distance
const REC_MIN = 100;          // recovery short-distance floor distance
// Short-distance ES floors (strokes) by lie, used for distances below the model.
const FLOOR_FAIRWAY = 1, FLOOR_ROUGH = 1.5, FLOOR_SAND = 2, FLOOR_RECOVERY = 3;
// LPGA long-tail / penalty tuning.
const LPGA_FW_TAIL_SAT = 220;
const PEN_ROUGH_FROM = 250, PEN_ROUGH_SLOPE = 45e-5;
const PEN_WATER_FROM = 220, PEN_WATER_SLOPE = 1e-4;
const PEN_TEE_FROM = 250, PEN_TEE_TO = MAX_D, PEN_TEE_AMT = .14, PEN_TEE_POW = 10;

// Per-division constant stroke penalty and the PGA/LPGA baseline each maps to.
const DIVISION_PENALTY: Record<Division, number> = {
  'pga-tour': 0, 'lpga-tour': 0,
  'mens-college': 3.5, 'womens-college': 3.5,
  'junior-boys': 8.5, 'junior-girls': 8.5,
};
const DIVISION_BASELINE: Record<Division, Tour> = {
  'pga-tour': 'pga', 'lpga-tour': 'lpga',
  'mens-college': 'pga', 'womens-college': 'lpga',
  'junior-boys': 'pga', 'junior-girls': 'lpga',
};
// 18-hole representative tee distances used to total a baseline round.
const ROUND_TEE_DISTANCES = [
  ...new Array(4).fill(175), ...new Array(10).fill(400), ...new Array(4).fill(575),
];
const DIVISION_ALIASES: Record<string, Division> = {
  'pga-tour': 'pga-tour', 'lpga-tour': 'lpga-tour',
  'mens-college': 'mens-college', 'womens-college': 'womens-college',
  'junior-boys': 'junior-boys', 'junior-girls': 'junior-girls',
  pga: 'pga-tour', lpga: 'lpga-tour',
  ncaam: 'mens-college', ncaaw: 'womens-college',
  hsm: 'junior-boys', hsw: 'junior-girls',
  'pga tour': 'pga-tour', 'lpga tour': 'lpga-tour',
  "men's college": 'mens-college', 'womens college': 'womens-college',
  "women's college": 'womens-college',
  'junior boys': 'junior-boys', 'junior girls': 'junior-girls',
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// Polynomial value and derivative.
const poly = (x: number, c: number[]) => { let t = 0; for (let s = 0; s < c.length; s++) t += c[s] * x ** s; return t; };
const dpoly = (x: number, c: number[]) => { let t = 0; for (let s = 1; s < c.length; s++) t += s * c[s] * x ** (s - 1); return t; };
// Linear ramp from (0, lo) through (atX, atVal), evaluated at x.
const ramp = (x: number, lo: number, atX: number, atVal: number) => atX <= 0 ? atVal : lo + ((atVal - lo) / atX) * x;
// Value t at <= n, then linear with slope s beyond.
const linExt = (x: number, n: number, t: number, s: number) => x <= n ? t : t + (x - n) * s;

// Normalized position of `d` within a lie's observed range → [0,1].
function norm(lie: string, d: number): number {
  const [lo = 0, hi = 0] = OBSERVED_RANGE[lie] ?? [];
  const v = clamp(d, lo, hi);
  return hi <= lo ? 0 : (v - lo) / (hi - lo);
}
// LPGA shift value / derivative for a lie at distance d.
function lpgaShift(lie: string, d: number): number {
  return poly(norm(lie, d), CORE_SHIFT[lie] ?? []);
}
function lpgaShiftDeriv(lie: string, d: number): number {
  const c = CORE_SHIFT[lie] ?? [];
  const [lo = 0, hi = 0] = OBSERVED_RANGE[lie] ?? [];
  if (hi <= lo) return 0;
  return dpoly(norm(lie, d), c) * (1 / (hi - lo));
}
// Combined tour shift + extra offset for the within-range value of a lie.
function tourShift(tour: Tour, lie: string, d: number, extra: number): number {
  const key = lie === 'water' ? 'rough' : lie;
  let o = 0;
  if (tour === 'lpga' && (key === 'tee' || key === 'fairway' || key === 'green')) o = lpgaShift(key, d);
  return o + extra;
}
function tourShiftDeriv(tour: Tour, lie: string, d: number): number {
  const key = lie === 'water' ? 'rough' : lie;
  if (tour !== 'lpga') return 0;
  return key === 'tee' || key === 'fairway' || key === 'green' ? lpgaShiftDeriv(key, d) : 0;
}

// Within-observed-range ES base value for a lie at distance d (yards).
function baseES(tour: Tour, extra: number, lie: string, d: number): number {
  if (lie === 'fairway') return poly(d, PGA_FAIRWAY) + tourShift(tour, 'fairway', d, extra);
  if (lie === 'rough') return poly(d, PGA_ROUGH) + tourShift(tour, 'rough', d, extra);
  if (lie === 'green') return poly(d, PGA_GREEN) + tourShift(tour, 'green', d, extra);
  if (lie === 'sand') return poly(d, PGA_SAND) + tourShift(tour, 'sand', d, extra);
  if (lie === 'recovery') return poly(d, PGA_RECOVERY) + tourShift(tour, 'recovery', d, extra);
  // tee — below TEE_BLEND_MAX, blend toward the fairway-approach value.
  const teeVal = poly(d, PGA_TEE) + tourShift(tour, 'tee', d, extra);
  if (d <= TEE_BLEND_MAX) {
    const appr = fairwayES(tour, extra, d);
    const r = clamp((d - TEE_MIN) / (TEE_BLEND_MAX - TEE_MIN), 0, 1);
    const smooth = r * r * (3 - 2 * r);
    return appr + (teeVal - appr) * smooth;
  }
  return teeVal;
}
// Derivative of the within-range base value at the observed-range edge.
function baseDeriv(tour: Tour, lie: string, d: number): number {
  if (lie === 'tee') return dpoly(d, PGA_TEE) + tourShiftDeriv(tour, 'tee', d);
  if (lie === 'fairway') return dpoly(d, PGA_FAIRWAY) + tourShiftDeriv(tour, 'fairway', d);
  return dpoly(d, PGA_ROUGH) + tourShiftDeriv(tour, 'rough', d);
}
// Smooth saturating extension used for the LPGA fairway long tail.
const satExt = (v: number, dx: number, slope0: number, slopeInf: number, sat: number) =>
  dx <= 0 ? v : v + slopeInf * dx + (slope0 - slopeInf) * sat * (1 - Math.exp(-dx / sat));

const fwTailSlope = () => (5.25 - poly(FW_MAX, PGA_FAIRWAY)) / (600 - FW_MAX);
const roTailSlope = () => (5.4 - poly(RO_MAX, PGA_ROUGH)) / (600 - RO_MAX);

// Fairway ES across the full distance range (extrapolated beyond observed). Also
// the basis for tee shots and any long approach.
function fairwayES(tour: Tour, extra: number, d: number): number {
  if (d <= 0) return 1;
  const atMin = baseES(tour, extra, 'fairway', FW_MIN);
  if (d < FW_MIN) return ramp(d, FLOOR_FAIRWAY, FW_MIN, atMin);
  if (d <= FW_MAX) return baseES(tour, extra, 'fairway', d);
  const atMax = baseES(tour, extra, 'fairway', FW_MAX);
  const dx = d - FW_MAX;
  const tail = fwTailSlope();
  if (tour === 'lpga') {
    const slope0 = Math.max(baseDeriv(tour, 'fairway', FW_MAX), tail);
    return satExt(atMax, dx, slope0, tail, LPGA_FW_TAIL_SAT);
  }
  return atMax + dx * tail;
}
const pgaFairwayES = (d: number) => fairwayES('pga', 0, d);

// Ratio used to scale non-PGA lie adjustments by the local difficulty.
function diffRatio(tour: Tour, extra: number, d: number): number {
  if (tour === 'pga' && extra === 0) return 1;
  const base = pgaFairwayES(d);
  if (base <= 1 + 1e-9) return 1;
  return Math.min(3, fairwayES(tour, extra, d) / base);
}

// PGA rough ES across full range.
function pgaRoughES(d: number): number {
  if (d <= 0) return 1;
  const atMin = baseES('pga', 0, 'rough', RO_MIN);
  if (d < RO_MIN) return ramp(d, FLOOR_ROUGH, RO_MIN, atMin);
  if (d <= RO_MAX) return baseES('pga', 0, 'rough', d);
  return baseES('pga', 0, 'rough', RO_MAX) + (d - RO_MAX) * roTailSlope();
}
function roughES(tour: Tour, extra: number, d: number): number {
  if (tour === 'pga' && extra === 0) return pgaRoughES(d);
  const a = fairwayES(tour, extra, d);
  const delta = pgaRoughES(d) - pgaFairwayES(d);
  return a + delta * diffRatio(tour, extra, d);
}

function greenES(tour: Tour, extra: number, d: number): number {
  if (d <= 0) return 1;
  if (d > GR_MAX) return fairwayES(tour, extra, d);
  const atMin = baseES(tour, extra, 'green', GR_MIN);
  return d < GR_MIN ? ramp(d, 1, GR_MIN, atMin) : baseES(tour, extra, 'green', d);
}

function teeES(tour: Tour, extra: number, d: number): number {
  if (d < TEE_MIN) return fairwayES(tour, extra, d);
  if (d <= MAX_D) return baseES(tour, extra, 'tee', d);
  const atMax = baseES(tour, extra, 'tee', MAX_D);
  const slope = baseDeriv(tour, 'tee', MAX_D);
  return linExt(d, MAX_D, atMax, slope);
}

function pgaSandES(d: number): number {
  if (d <= 0) return 1;
  const atMin = baseES('pga', 0, 'sand', SAND_MIN);
  if (d < SAND_MIN) return ramp(d, FLOOR_SAND, SAND_MIN, atMin);
  if (d <= MAX_D) return baseES('pga', 0, 'sand', d);
  return linExt(d, MAX_D, baseES('pga', 0, 'sand', MAX_D), dpoly(MAX_D, PGA_SAND));
}
function sandES(tour: Tour, extra: number, d: number): number {
  if (tour === 'pga' && extra === 0) return pgaSandES(d);
  return fairwayES(tour, extra, d) + (pgaSandES(d) - pgaFairwayES(d)) * diffRatio(tour, extra, d);
}

function pgaRecoveryES(d: number): number {
  if (d <= 0) return 1;
  const atMin = baseES('pga', 0, 'recovery', REC_MIN);
  if (d < REC_MIN) return ramp(d, FLOOR_RECOVERY, REC_MIN, atMin);
  if (d <= MAX_D) return baseES('pga', 0, 'recovery', d);
  return linExt(d, MAX_D, baseES('pga', 0, 'recovery', MAX_D), dpoly(MAX_D, PGA_RECOVERY));
}
function recoveryES(tour: Tour, extra: number, d: number): number {
  if (tour === 'pga' && extra === 0) return pgaRecoveryES(d);
  return fairwayES(tour, extra, d) + (pgaRecoveryES(d) - pgaFairwayES(d)) * diffRatio(tour, extra, d);
}

// LPGA-only excess penalties applied on top of the base lie value.
const excess = (x: number, from: number, slope: number) => x <= from ? 0 : (x - from) * slope;
function teeLongPenalty(d: number): number {
  const span = PEN_TEE_TO - PEN_TEE_FROM;
  if (d <= PEN_TEE_FROM) return 0;
  if (d <= PEN_TEE_TO) return PEN_TEE_AMT * ((d - PEN_TEE_FROM) / span) ** PEN_TEE_POW;
  return PEN_TEE_AMT + (d - PEN_TEE_TO) * (PEN_TEE_AMT * PEN_TEE_POW / span);
}
function lpgaPenalty(lie: string, d: number, base: number): number {
  let s = base + excess(d, PEN_ROUGH_FROM, PEN_ROUGH_SLOPE);
  if (lie === 'rough' || lie === 'water') s += excess(d, PEN_WATER_FROM, PEN_WATER_SLOPE);
  if (lie === 'tee') s += teeLongPenalty(d);
  return s;
}

// Master per-lie ES dispatch (tour baseline, extra offset, distance, lie).
function lieES(tour: Tour, extra: number, d: number, lie: string): number {
  let a: number;
  if (lie === 'green') a = greenES(tour, extra, d);
  else if (lie === 'fairway') a = fairwayES(tour, extra, d);
  else if (lie === 'rough') a = roughES(tour, extra, d);
  else if (lie === 'sand') a = sandES(tour, extra, d);
  else if (lie === 'recovery') a = recoveryES(tour, extra, d);
  else if (lie === 'tee') a = teeES(tour, extra, d);
  else a = roughES(tour, extra, d) + 1; // water
  return tour !== 'lpga' ? a : lpgaPenalty(lie, d, a);
}

// Total over-par strokes for a baseline round (for division scaling).
function roundOverPar(tour: Tour): number {
  return ROUND_TEE_DISTANCES.reduce((n, d) => n + Math.max(0, lieES(tour, 0, d, 'tee') - 1), 0);
}
const ROUND_BASELINE = { pga: roundOverPar('pga'), lpga: roundOverPar('lpga') };

function divisionFactor(div: Division): number {
  const penalty = DIVISION_PENALTY[div] ?? 0;
  if (penalty <= 0) return 1;
  const base = ROUND_BASELINE[DIVISION_BASELINE[div]];
  return base <= 1e-9 ? 1 : 1 + penalty / base;
}
function scaleForDivision(div: Division, es: number): number {
  const f = divisionFactor(div);
  return Math.abs(f - 1) < 1e-12 ? es : 1 + (es - 1) * f;
}

function normalizeDivision(d?: string): Division {
  if (!d) return 'pga-tour';
  return DIVISION_ALIASES[String(d).trim().toLowerCase()] ?? 'pga-tour';
}
function normalizeLie(lie?: string): Lie {
  switch (String(lie ?? 'rough').trim().toLowerCase()) {
    case 'green': return 'green';
    case 'fairway': return 'fairway';
    case 'rough': return 'rough';
    case 'sand': case 'bunker': return 'sand';
    case 'water': case 'hazard': case 'ob': case 'out of bounds': return 'water';
    case 'recovery': return 'recovery';
    case 'tee': return 'tee';
    default: return 'rough';
  }
}

// --- short-game strokes-gained skill modifier (faithful port) ---
//
// On top of the base polynomials (which are PGA-Tour average), a player's own
// strokes-gained around-the-green and putting shift ES for chips/pitches and
// putts. Tour average is sgArg = sgPutting = 0, so the default is a no-op: the
// base model already represents an average PGA-Tour short game. A positive SG
// (better than tour average) lowers ES; negative raises it.
const SG_ARG_FULL_YDS = 45;       // full ARG weight at/under this distance
const SG_ARG_MAX_YDS = 55;        // ARG modifier fades to zero by here
const SG_DEFAULT_ARG_SHOTS = 4.5; // tour-typical around-green shots per round
const SG_DEFAULT_PUTTS = 32;      // tour-typical putts per round

export type ShortGame = {
  sgArg?: number;            // strokes gained around-the-green, per round (tour avg 0)
  sgPutting?: number;        // strokes gained putting, per round (tour avg 0)
  argShotsPerRound?: number; // optional; defaults to 4.5
  puttsPerRound?: number;    // optional; defaults to 32
};

// Distance weight for the around-the-green modifier (1 ≤45 yd, smoothstep to 0 by 55 yd).
function argWeight(d: number): number {
  if (d <= SG_ARG_FULL_YDS) return 1;
  if (d >= SG_ARG_MAX_YDS) return 0;
  const n = (d - SG_ARG_FULL_YDS) / (SG_ARG_MAX_YDS - SG_ARG_FULL_YDS);
  return 1 - n * n * (3 - 2 * n);
}
// Per-shot ES delta from a per-round strokes-gained figure.
function sgPerShot(sg: number | undefined, shotsPerRound: number | undefined, fallback: number): number {
  if (sg == null) return 0;
  const s = shotsPerRound && shotsPerRound > 0 ? shotsPerRound : fallback;
  return -(sg / s);
}

/**
 * Expected strokes to hole out — the faithful CADD-AI model.
 * @param distanceYds distance to the hole, in YARDS for every lie (green too).
 * @param lie         lie type (water counts as rough + a 1-stroke penalty).
 * @param division    player population (default PGA Tour).
 * @param sg          optional strokes-gained short-game skill (default = tour average, a no-op).
 */
export function expectedStrokesAt(
  distanceYds: number,
  lie: Lie | string = 'fairway',
  division: Division | string = 'pga-tour',
  sg?: ShortGame,
): number {
  const div = normalizeDivision(division);
  const baseline = DIVISION_BASELINE[div];
  const cleanLie = normalizeLie(lie);
  const d = Math.max(0, Number.isFinite(distanceYds) ? distanceYds : 0);

  let es: number;
  if (cleanLie === 'water') {
    es = scaleForDivision(div, lieES(baseline, 0, d, 'rough')) + 1;
  } else {
    es = scaleForDivision(div, lieES(baseline, 0, d, cleanLie));
  }
  es = Math.max(1, es);

  // Strokes-gained skill: putting on the green, around-the-green for short non-green shots.
  if (sg) {
    if (cleanLie === 'green') {
      es += sgPerShot(sg.sgPutting, sg.puttsPerRound, SG_DEFAULT_PUTTS);
    } else if (cleanLie !== 'water' && d <= SG_ARG_MAX_YDS) {
      es += sgPerShot(sg.sgArg, sg.argShotsPerRound, SG_DEFAULT_ARG_SHOTS) * argWeight(d);
    }
    es = Math.max(1, es);
  }
  return es;
}

/**
 * Legacy/simple wrapper kept for existing callers. Distance is YARDS for every
 * lie including the green (≈3 ft per yard) — callers that have feet should divide
 * by 3 before calling, or use `expectedStrokesAt` directly.
 */
export function expectedStrokes(lie: Lie, distance: number): number {
  return expectedStrokesAt(distance, lie, 'pga-tour');
}

export const ES_NOTE =
  'Strokes-to-hole-out from the CADD-AI strokes-gained model: degree-6 polynomial fits of tour strokes vs. distance per lie, with LPGA shifts and per-division scaling. Used to rank aim points, not a guarantee.';

export const DIVISIONS: { value: Division; label: string }[] = [
  { value: 'pga-tour', label: 'PGA Tour' },
  { value: 'lpga-tour', label: 'LPGA Tour' },
  { value: 'mens-college', label: "Men's College" },
  { value: 'womens-college', label: "Women's College" },
  { value: 'junior-boys', label: 'Junior Boys' },
  { value: 'junior-girls', label: 'Junior Girls' },
];
