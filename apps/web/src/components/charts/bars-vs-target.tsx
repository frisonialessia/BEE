import { DATA } from "@/components/charts/palette";

export interface BarPoint {
  label: string;
  value: number;
  current?: boolean;
}

/**
 * Monthly bars against a target line. Bars that reach the target take
 * `hitColor`; the current period is emphasized. Thin 4px-rounded ends.
 */
export function BarsVsTarget({
  points,
  target,
  color = DATA.indigo,
  hitColor = DATA.honey,
  targetLabel,
  height = 140,
  formatValue = (v) => String(Math.round(v)),
  width = 600,
}: {
  points: BarPoint[];
  target?: number | null;
  color?: string;
  hitColor?: string;
  targetLabel?: string;
  height?: number;
  formatValue?: (v: number) => string;
  /** viewBox width — ~320 inside a narrow (4-column) box. */
  width?: number;
}) {
  const W = width;
  const H = height;
  const padBottom = 22;
  const padTop = 18;
  const max = Math.max(...points.map((p) => p.value), target ?? 0, 1);
  const n = points.length;
  const slot = (W - 20) / n;
  const bw = Math.min(28, slot * 0.55);
  const ty = target ? H - padBottom - (target / max) * (H - padTop - padBottom) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {points.map((p, i) => {
        const x = 10 + i * slot + (slot - bw) / 2;
        const h = (p.value / max) * (H - padTop - padBottom);
        const y = H - padBottom - h;
        const hit = target ? p.value >= target : false;
        return (
          <g key={p.label}>
            <title>{`${p.label} · ${formatValue(p.value)}`}</title>
            <rect x={x} y={y} width={bw} height={Math.max(h, p.value > 0 ? 4 : 1)} rx={4} fill={hit ? hitColor : color} opacity={p.current || hit ? 1 : 0.55} />
            <text x={x + bw / 2} y={H - 6} fontSize={10} fill="var(--color-text-muted)" textAnchor="middle">
              {p.label}
            </text>
          </g>
        );
      })}
      {ty !== null && (
        <g>
          <line x1={10} x2={W - 10} y1={ty} y2={ty} stroke="var(--color-text)" strokeDasharray="4 3" opacity={0.45} />
          {targetLabel && (
            <>
              <rect x={W - 92} y={ty - 20} width={82} height={16} rx={6} fill="var(--color-text)" />
              <text x={W - 51} y={ty - 8} fontSize={9.5} fill="var(--color-card)" textAnchor="middle">
                {targetLabel}
              </text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}
