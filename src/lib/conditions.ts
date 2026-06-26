// Course-condition presets, matching cadd-ai.vercel.app.
//
// Green speed is a Stimpmeter reading; firmness controls how much the ball rolls
// out after landing (a fraction of the real CADD-AI rollout model). Course
// presets bundle the two into the named setups the real app offers.

export type Firmness = 'No Roll' | 'Soft' | 'Medium' | 'Firm' | 'Very Firm';

// Fraction-of-rollout by firmness (the real engine's surface-firmness values).
export const ROLLOUT_FRACTION: Record<Firmness, number> = {
  'No Roll': 0, Soft: 0.06, Medium: 0.22, Firm: 0.38, 'Very Firm': 0.5,
};
export const FIRMNESS_ORDER: Firmness[] = ['No Roll', 'Soft', 'Medium', 'Firm', 'Very Firm'];

// Named green speeds (Stimpmeter), as in the real app's selector.
export const GREEN_SPEEDS: { label: string; stimp: number }[] = [
  { label: 'Very Slow', stimp: 7.5 },
  { label: 'Slow', stimp: 8 },
  { label: 'Standard', stimp: 10 },
  { label: 'Fast', stimp: 11 },
  { label: 'Very Fast', stimp: 13 },
  { label: 'US Open', stimp: 14.5 },
];

// One-click course setups (firmness + stimp), matching the real app's presets.
export const COURSE_CONDITIONS: { id: string; label: string; description: string; firmness: Firmness; stimp: number }[] = [
  { id: 'no_roll', label: 'No Roll', description: 'No ball roll · Stimp 10 · Normal difficulty', firmness: 'No Roll', stimp: 10 },
  { id: 'standard', label: 'Standard', description: 'Medium firmness · Stimp 10 · Normal conditions', firmness: 'Medium', stimp: 10 },
  { id: 'tournament', label: 'Tournament', description: 'Hard rough/recovery/trees · Stimp 11 · Soft off-fairway lies', firmness: 'Medium', stimp: 11 },
  { id: 'us_open', label: 'US Open', description: 'Firm fairways · Stimp 13 · Brutal rough & hazards', firmness: 'Firm', stimp: 13 },
  { id: 'links', label: 'Links', description: 'Very firm ground · Stimp 8 · Penal bunkers & hazards', firmness: 'Very Firm', stimp: 8 },
];

// Putting-difficulty multiplier from green speed: faster greens (higher stimp)
// make lag putting harder, so expected putts rise. Standard (stimp 10) = 1.0.
export function stimpPuttFactor(stimp: number): number {
  return 1 + (stimp - 10) * 0.02;
}
