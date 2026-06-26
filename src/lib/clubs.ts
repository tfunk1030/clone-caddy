// Club / bag model. Carry distances are scaled to the player's driver carry so
// the bag matches their length, and per-club dispersion is derived from the
// player's stock dispersion (measured at a ~150 yd reference) scaled by carry —
// longer clubs spray more. Used to recommend a club for a target and to feed
// the right dispersion into the expected-strokes optimizer.

export type Club = { name: string; carry: number; offlineSD: number; depthSD: number };

// Reference bag for a 260 yd driver carry (tour-ish gaps), as fraction of driver.
const BAG: { name: string; frac: number }[] = [
  { name: 'Driver', frac: 1.0 },
  { name: '3-wood', frac: 0.905 },
  { name: '5-wood', frac: 0.83 },
  { name: 'Hybrid', frac: 0.785 },
  { name: '4-iron', frac: 0.75 },
  { name: '5-iron', frac: 0.715 },
  { name: '6-iron', frac: 0.675 },
  { name: '7-iron', frac: 0.635 },
  { name: '8-iron', frac: 0.585 },
  { name: '9-iron', frac: 0.53 },
  { name: 'PW', frac: 0.47 },
  { name: 'GW', frac: 0.40 },
  { name: 'SW', frac: 0.34 },
  { name: 'LW', frac: 0.27 },
];

const REFERENCE_CARRY = 150; // the distance at which the player's stock σ applies

// Build the player's bag from driving distance + stock dispersion.
export function buildBag(drivingDistance: number, offlineSD: number, depthSD: number): Club[] {
  const driver = drivingDistance || 260;
  return BAG.map(({ name, frac }) => {
    const carry = Math.round(driver * frac);
    const scale = carry / REFERENCE_CARRY; // dispersion grows ~linearly with carry
    return {
      name,
      carry,
      offlineSD: Math.max(2, +(offlineSD * scale).toFixed(1)),
      depthSD: Math.max(2, +(depthSD * scale).toFixed(1)),
    };
  });
}

// Recommend the club whose carry best matches the required (plays-like) carry.
// Prefers the shortest club that can reach it; if nothing reaches, the longest.
export function recommendClub(bag: Club[], requiredCarry: number): Club {
  const sorted = [...bag].sort((a, b) => a.carry - b.carry);
  const reachable = sorted.filter((c) => c.carry >= requiredCarry - 3);
  if (reachable.length) {
    // Closest reachable club (smallest over-carry).
    return reachable.reduce((a, b) => (Math.abs(b.carry - requiredCarry) < Math.abs(a.carry - requiredCarry) ? b : a));
  }
  return sorted[sorted.length - 1]; // can't reach — hit the longest
}
