import type { GreenModel, SimResult } from '@/lib/shotModel';

const OUTCOME_COLOR: Record<string, string> = {
  green: '#37c871',
  rough: '#5b6b78',
  sand: '#f5e08a',
  water: '#3b82f6',
};

// Top-down view. Pin at origin; x = lateral (right +), y = depth (long +).
export function GreenMap({
  model, aim, landings, span = 35,
}: {
  model: GreenModel;
  aim: { x: number; y: number };
  landings: SimResult['landings'];
  span?: number; // yards from center to edge
}) {
  const S = 360; // svg size px
  const c = S / 2;
  const k = c / span; // px per yard
  const X = (x: number) => c + x * k;
  const Y = (y: number) => c - y * k; // screen y inverted

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full rounded-lg border border-border bg-[#0a1420]">
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
      {/* aim point */}
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
