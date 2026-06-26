import type { GreenModel, SimResult } from '@/lib/shotModel';

const OUTCOME_COLOR: Record<string, string> = {
  green: '#37c871',
  rough: '#5b6b78',
  sand: '#f5e08a',
  water: '#3b82f6',
};

// Blue → green → red ramp for the expected-strokes surface (low = better = blue).
function esColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(x < 0.5 ? 60 + x * 2 * 140 : 200);
  const g = Math.round(x < 0.5 ? 180 : 180 - (x - 0.5) * 2 * 150);
  const b = Math.round(x < 0.5 ? 200 - x * 2 * 120 : 70);
  return `rgb(${r},${g},${b})`;
}

// Top-down view. Pin at origin; x = lateral (right +), y = depth (long +).
export function GreenMap({
  model, aim, landings, span = 35, surface, markers,
}: {
  model: GreenModel;
  aim: { x: number; y: number };
  landings: SimResult['landings'];
  span?: number; // yards from center to edge
  surface?: { x: number; y: number; es: number }[]; // ES heatmap over the aim grid
  markers?: { x: number; y: number; color: string; label: string }[]; // strategy aim points
}) {
  const S = 360; // svg size px
  const c = S / 2;
  const k = c / span; // px per yard
  const X = (x: number) => c + x * k;
  const Y = (y: number) => c - y * k; // screen y inverted

  // Normalize the ES surface for coloring.
  let lo = 0, hi = 1, cell = 4;
  if (surface && surface.length > 1) {
    lo = Math.min(...surface.map((s) => s.es));
    hi = Math.max(...surface.map((s) => s.es));
    const xs = [...new Set(surface.map((s) => s.x))].sort((a, b) => a - b);
    cell = xs.length > 1 ? (xs[1] - xs[0]) * k : 4;
  }

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full rounded-lg border border-border bg-[#0a1420]">
      {/* expected-strokes surface heatmap */}
      {surface && surface.map((s, i) => (
        <rect key={`s${i}`} x={X(s.x) - cell / 2} y={Y(s.y) - cell / 2} width={cell + 0.5} height={cell + 0.5}
          fill={esColor(hi > lo ? (s.es - lo) / (hi - lo) : 0)} fillOpacity={0.5} />
      ))}
      {/* range rings */}
      {[10, 20, 30].map((r) => (
        <circle key={r} cx={c} cy={c} r={r * k} fill="none" stroke="var(--border)" strokeDasharray="3 5" />
      ))}
      {/* water half-plane */}
      {model.water && (
        <rect
          x={model.water.side === 'L' ? 0 : model.water.side === 'R' ? X(model.water.line) : 0}
          y={model.water.side === 'long' ? 0 : model.water.side === 'short' ? Y(-model.water.line) : 0}
          width={model.water.side === 'L' ? X(-model.water.line) : model.water.side === 'R' ? S - X(model.water.line) : S}
          height={model.water.side === 'long' ? Y(model.water.line) : model.water.side === 'short' ? S - Y(-model.water.line) : S}
          fill="#3b82f6" fillOpacity={0.18}
        />
      )}
      {/* green */}
      <circle cx={X(model.greenCenter.x)} cy={Y(model.greenCenter.y)} r={model.greenRadius * k}
        fill="#37c871" fillOpacity={0.16} stroke="#37c871" strokeOpacity={0.5} />
      {/* bunker */}
      {model.bunker && (
        <circle cx={X(model.bunker.x)} cy={Y(model.bunker.y)} r={model.bunker.r * k}
          fill="#f5e08a" fillOpacity={0.35} stroke="#caa84a" />
      )}
      {/* landing points */}
      {landings.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={2} fill={OUTCOME_COLOR[p.outcome]} fillOpacity={0.6} />
      ))}
      {/* strategy aim points (aggressive / optimal / safe) */}
      {markers && markers.map((m, i) => (
        <g key={`m${i}`}>
          <circle cx={X(m.x)} cy={Y(m.y)} r={5} fill="none" stroke={m.color} strokeWidth={2} />
          <circle cx={X(m.x)} cy={Y(m.y)} r={1.5} fill={m.color} />
          <text x={X(m.x) + 7} y={Y(m.y) + 3} fill={m.color} fontSize={9} fontWeight={700}>{m.label}</text>
        </g>
      ))}
      {/* focused aim crosshair */}
      <g>
        <line x1={X(aim.x) - 7} y1={Y(aim.y)} x2={X(aim.x) + 7} y2={Y(aim.y)} stroke="#fff" strokeWidth={1.5} />
        <line x1={X(aim.x)} y1={Y(aim.y) - 7} x2={X(aim.x)} y2={Y(aim.y) + 7} stroke="#fff" strokeWidth={1.5} />
      </g>
      {/* pin */}
      <g>
        <circle cx={c} cy={c} r={3.5} fill="#ef4444" />
        <line x1={c} y1={c} x2={c} y2={c - 14} stroke="#ef4444" strokeWidth={1.5} />
      </g>
    </svg>
  );
}
