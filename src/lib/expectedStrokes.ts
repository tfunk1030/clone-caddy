// Expected-strokes (strokes-to-hole-out) baseline model.
//
// Anchor values follow the PGA Tour benchmark popularized by Mark Broadie
// ("Every Shot Counts"): the average number of strokes a tour pro takes to
// hole out from a given distance and lie. We linearly interpolate between
// anchors and clamp at the ends. These are estimates, good enough to drive an
// aim-optimization that demonstrates the trade-offs CADD-AI models.

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'recovery' | 'green';

// [distance (yards), strokes to hole out]
const FAIRWAY: [number, number][] = [
  [10, 2.18], [20, 2.40], [30, 2.52], [40, 2.60], [60, 2.67], [80, 2.72],
  [100, 2.80], [120, 2.85], [140, 2.91], [160, 2.98], [180, 3.08], [200, 3.19],
  [220, 3.32], [240, 3.45], [260, 3.58], [280, 3.74], [300, 3.90], [350, 4.20],
  [400, 4.50], [450, 4.80], [500, 5.10],
];
const ROUGH: [number, number][] = [
  [20, 2.59], [40, 2.78], [60, 2.91], [80, 2.96], [100, 3.02], [120, 3.08],
  [140, 3.15], [160, 3.23], [180, 3.31], [200, 3.42], [220, 3.53], [240, 3.65],
  [260, 3.78], [280, 3.92], [300, 4.08], [350, 4.40], [400, 4.70],
];
const SAND: [number, number][] = [
  [10, 2.40], [20, 2.50], [30, 2.66], [40, 2.82], [60, 3.00], [80, 3.10],
  [100, 3.18], [120, 3.27], [140, 3.36], [160, 3.45], [180, 3.55], [200, 3.70],
  [220, 3.84], [240, 3.98],
];
const RECOVERY: [number, number][] = [
  [50, 3.45], [100, 3.70], [150, 3.95], [200, 4.20], [250, 4.55],
];
// Putting: [distance (feet), putts to hole out]
const GREEN: [number, number][] = [
  [1, 1.001], [2, 1.01], [3, 1.05], [4, 1.13], [5, 1.23], [6, 1.34], [7, 1.42],
  [8, 1.50], [9, 1.56], [10, 1.61], [12, 1.70], [15, 1.78], [18, 1.84],
  [20, 1.87], [25, 1.94], [30, 2.00], [40, 2.10], [50, 2.20], [60, 2.27], [90, 2.45],
];

const TABLES: Record<Lie, [number, number][]> = {
  tee: FAIRWAY, // a tee-box lie plays like a clean fairway lie
  fairway: FAIRWAY,
  rough: ROUGH,
  sand: SAND,
  recovery: RECOVERY,
  green: GREEN,
};

function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** Expected strokes to hole out. `distance` is yards (feet when lie==='green'). */
export function expectedStrokes(lie: Lie, distance: number): number {
  return interp(TABLES[lie], Math.max(0, distance));
}

export const ES_NOTE =
  'Baseline = average PGA-Tour strokes to hole out from a given lie & distance (Broadie). Estimates used to rank aim points, not a guarantee.';
