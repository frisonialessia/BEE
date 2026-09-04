"use client";

import { useState } from "react";

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
  const [hover, setHover] = useState<number | null>(null);
  const padBottom = 24;
  const padTop = 22;
  const max = Math.max(...points.map((p) => p.value), target ?? 0, 1);
  const n = Math.max(1, points.length);
  const slot = (W - 20) / n;
  const bw = Math.min(40, Math.max(2, slot * (slot < 14 ? 0.7 : 0.55)));
  const ty = target ? H - padBottom - (target / max) * (H - padTop - padBottom) : null;
  // A label every k bars so labels never collide on a long series (five
  // years = 60 bars); the last bar always keeps its label.
  const every = Math.max(1, Math.ceil(40 / slot));
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every);
  return (
    <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 block"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left - 10) / slot))));
        }}
      >
        {points.map((p, i) => {
          const x = 10 + i * slot + (slot - bw) / 2;
          const h = (p.value / max) * (H - padTop - padBottom);
          const y = H - padBottom - h;
          const hit = target ? p.value >= target : false;
          return (
            <g key={p.label}>
              <rect x={x} y={y} width={bw} height={Math.max(h, p.value > 0 ? 4 : 1)} rx={4} fill={colorFor ? colorFor(p, i, max) : hit ? hitColor : color} opacity={hover !== null && hover !== i ? 0.45 : colorFor || p.current || hit ? 1 : 0.55} />
              {showLabel(i) && (
                <text x={x + bw / 2} y={H - 7} fill="var(--color-text-muted)" textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        {ty !== null && (
          <g>
            <title>{targetLabel ? `${targetLabel} · ${formatValue(target ?? 0)}` : formatValue(target ?? 0)}</title>
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
      {/* Amounts only on hover — the chart itself stays quiet. */}
      {hover !== null && points[hover] && (
        <div
          className={`pointer-events-none absolute whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)] ${
            (10 + hover * slot + slot / 2) / W > 0.8 ? "-translate-x-full" : (10 + hover * slot + slot / 2) / W < 0.2 ? "translate-x-0" : "-translate-x-1/2"
          }`}
          style={{
            left: 10 + hover * slot + slot / 2,
            top: Math.max(0, H - padBottom - (points[hover].value / max) * (H - padTop - padBottom) - 34),
          }}
        >
          {points[hover].label} · {formatValue(points[hover].value)}
        </div>
      )}
    </div>
  );
}
