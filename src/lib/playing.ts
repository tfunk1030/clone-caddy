// Playing-conditions engine: turn a raw distance into the "plays-like" distance
// a player must actually carry, and describe how wind bends the shot. Drives
// club choice (plays-like) and aiming (wind drift + dispersion widening).
//
// Conventions: bearings are compass degrees (0 = N, clockwise). Wind is given as
// the direction it blows FROM (meteorological). x = right of the shot line.

const toRad = (d: number) => (d * Math.PI) / 180;

export type ShotEnv = {
  windMph?: number;
  windFromDeg?: number;   // direction wind comes FROM
  shotBearingDeg?: number; // direction to the target
  elevationYd?: number;   // target above (+) / below (-) the player, yards
  altitudeFt?: number;
  tempF?: number;
  firmness?: 'Soft' | 'Medium' | 'Firm' | 'Very Firm';
};

export type Conditions = {
  playsLike: number;
  raw: number;
  breakdown: { windYd: number; elevationYd: number; airYd: number; firmnessYd: number };
  head: number;   // + headwind, − tailwind (mph)
  cross: number;  // + from the right (mph)
  driftX: number; // mean lateral landing push from crosswind (yards, +right)
  widen: number;  // dispersion σ multiplier from wind (>= 1)
};

const ROLLOUT: Record<string, number> = { Soft: 0, Medium: 2, Firm: 5, 'Very Firm': 9 };

export function shotConditions(rawYd: number, env: ShotEnv = {}): Conditions {
  const dist = Math.max(1, rawYd);
  const f = dist / 150; // scale effects with distance
  const windMph = env.windMph || 0;
  const theta = toRad((env.windFromDeg ?? 0) - (env.shotBearingDeg ?? 0));
  const head = windMph * Math.cos(theta);   // +into the shot
  const cross = windMph * Math.sin(theta);  // +from the right

  const windYd = (head >= 0 ? head * 1.0 : head * 0.55) * f;
  const elevationYd = env.elevationYd || 0; // ~1 yd per yd of rise
  const airPct = (((env.altitudeFt || 0) / 1000) * 2 + (((env.tempF ?? 70) - 70) / 10) * 1) / 100;
  const airYd = -dist * airPct; // warmer/higher flies farther → need less club
  const firmnessYd = -(ROLLOUT[env.firmness || 'Medium'] || 0) * f; // firm → rollout, carry less

  const playsLike = dist + windYd + elevationYd + airYd + firmnessYd;
  // Crosswind pushes the ball downwind: wind from the right (cross>0) pushes it left.
  const driftX = -cross * 0.9 * f;
  const widen = Math.min(1.6, 1 + (Math.max(0, head) * 0.006 + Math.abs(cross) * 0.012) * f);

  return {
    playsLike: Math.max(0, +playsLike.toFixed(1)),
    raw: dist,
    breakdown: {
      windYd: +windYd.toFixed(1), elevationYd: +elevationYd.toFixed(1),
      airYd: +airYd.toFixed(1), firmnessYd: +firmnessYd.toFixed(1),
    },
    head: +head.toFixed(1), cross: +cross.toFixed(1),
    driftX: +driftX.toFixed(1), widen: +widen.toFixed(3),
  };
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg: number) => DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
