"use client";

import { useId, useState } from "react";

import { DATA } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";

export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * One series over time with a soft fill, recessive grid, and a hover
 * crosshair + tooltip. Fills its box (see use-box-size): width and height
 * come from the card, `minHeight` only guards the empty-card case.
 */
export function AreaChart({
  points,
  color = DATA.indigo,
  minHeight = 140,
  formatValue = (v) => String(Math.round(v)),
  highlightLast = true,
}: {
  points: AreaPoint[];
  color?: string;
  minHeight?: number;
  formatValue?: (v: number) => string;
  highlightLast?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  if (points.length < 2) return <p className="bee-caption py-6 text-center">—</p>;

  const padX = 14;
  const padTop = 16;
  const padBottom = 24;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = (W - padX * 2) / (points.length - 1);
  const xy = points.map((p, i) => [padX + i * step, H - padBottom - (p.value / max) * (H - padTop - padBottom)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M${xy[0][0]},${H - padBottom} L${line.replace(/ /g, " L")} L${xy[xy.length - 1][0]},${H - padBottom} Z`;
  const active = hover ?? (highlightLast ? points.length - 1 : null);
  // Skip labels that would collide: keep every k-th so each has ≥ 48px,
  // and drop any that would touch the last label (always shown).
  const every = Math.max(1, Math.ceil(48 / step));
  const lastX = xy[xy.length - 1][0];
  const showLabel = (i: number) => i === points.length - 1 || (i % every === 0 && lastX - xy[i][0] >= 48);

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
          setHover(Math.max(0, Math.min(points.length - 1, Math.round((e.clientX - rect.left - padX) / step))));
        }}
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((k) => {
          const y = H - padBottom - k * (H - padTop - padBottom);
          return <line key={k} x1={padX} x2={W - padX} y1={y} y2={y} stroke="color-mix(in srgb, var(--color-text) 7%, transparent)" />;
        })}
        <path d={area} fill={`url(#${id}-g)`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          showLabel(i) ? (
            <text
              key={p.label}
              x={xy[i][0]}
              y={H - 7}
              fill="var(--color-text-muted)"
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              style={{ fontSize: "var(--bee-fs-body-2)" }}
            >
              {p.label}
            </text>
          ) : null,
        )}
        {active !== null && (
          <g>
            <line x1={xy[active][0]} x2={xy[active][0]} y1={padTop} y2={H - padBottom} stroke="var(--color-text)" strokeDasharray="3 3" opacity={0.35} />
            <circle cx={xy[active][0]} cy={xy[active][1]} r={4.5} fill={color} stroke="var(--color-card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {active !== null && (
        <div
          className={`pointer-events-none absolute whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)] ${
            xy[active][0] / W > 0.8 ? "-translate-x-full" : xy[active][0] / W < 0.2 ? "translate-x-0" : "-translate-x-1/2"
          }`}
          style={{ left: xy[active][0], top: Math.max(0, xy[active][1] - 34) }}
        >
          {points[active].label} · {formatValue(points[active].value)}
        </div>
      )}
    </div>
  );
}
