"use client";

import { DATA } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";

export interface BarPoint {
  label: string;
  value: number;
  current?: boolean;
}

/**
 * Monthly bars against a target line. Bars that reach the target take
 * `hitColor`; the current period is emphasized. Fills its box (see
 * use-box-size); labels are drawn at the standard type size.
 */
export function BarsVsTarget({
  points,
  target,
  color = DATA.indigo,
  hitColor = DATA.honey,
  targetLabel,
  minHeight = 140,
  formatValue = (v) => String(Math.round(v)),
  colorFor,
}: {
  points: BarPoint[];
  target?: number | null;
  color?: string;
  hitColor?: string;
  targetLabel?: string;
  minHeight?: number;
  formatValue?: (v: number) => string;
  /** Per-bar color (e.g. three strengths of one hue); overrides color/hitColor. */
  colorFor?: (point: BarPoint, index: number, max: number) => string;
}) {
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  const padBottom = 24;
  const padTop = 22;
  const max = Math.max(...points.map((p) => p.value), target ?? 0, 1);
  const n = Math.max(1, points.length);
  const slot = (W - 20) / n;
  const bw = Math.min(40, slot * 0.55);
  const ty = target ? H - padBottom - (target / max) * (H - padTop - padBottom) : null;
  return (
    <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block">
        {points.map((p, i) => {
          const x = 10 + i * slot + (slot - bw) / 2;
          const h = (p.value / max) * (H - padTop - padBottom);
          const y = H - padBottom - h;
          const hit = target ? p.value >= target : false;
          return (
            <g key={p.label}>
              <title>{`${p.label} · ${formatValue(p.value)}`}</title>
              <rect x={x} y={y} width={bw} height={Math.max(h, p.value > 0 ? 4 : 1)} rx={4} fill={colorFor ? colorFor(p, i, max) : hit ? hitColor : color} opacity={colorFor || p.current || hit ? 1 : 0.55} />
              <text x={x + bw / 2} y={H - 7} fill="var(--color-text-muted)" textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }}>
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
                <rect x={W - 74} y={ty - 22} width={64} height={18} rx={6} fill="var(--color-text)" />
                <text x={W - 42} y={ty - 9} fill="var(--color-card)" textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }}>
                  {targetLabel}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
