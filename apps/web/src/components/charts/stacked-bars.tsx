"use client";

import { useState } from "react";

import { REST, TONE, level } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";

export interface StackedPoint {
  label: string;
  /** Parts in legend order; the first three take the hue at 100/70/45 %,
   *  the rest are drawn in the page grey as "other". */
  parts: number[];
  /** Emphasised (the current period). */
  current?: boolean;
}

/**
 * Thin stacked bars across the width — the chart for a long series (84
 * days of signals, 26 weeks of activity). One hue, three intensities, grey
 * for the rest; a legend of dots names the parts. Fills its box; numbers
 * only on hover, where the tooltip breaks the bar down.
 */
export function StackedBars({
  points,
  legend,
  tone = TONE.market,
  minHeight = 140,
  labelEvery,
  formatValue = (v) => String(Math.round(v)),
  showLegend = true,
}: {
  points: StackedPoint[];
  /** Names of the parts, in order. */
  legend: string[];
  tone?: string;
  minHeight?: number;
  /** Draw a label every n bars (default: enough for 48px between labels). */
  labelEvery?: number;
  formatValue?: (v: number) => string;
  showLegend?: boolean;
}) {
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(1, points.length);
  const padBottom = 20;
  const padTop = 6;
  const totals = points.map((p) => p.parts.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const slot = W / n;
  const gap = slot > 6 ? Math.max(1, Math.round(slot * 0.28)) : 1;
  const bw = Math.max(2, slot - gap);
  const every = labelEvery ?? Math.max(1, Math.ceil(56 / slot));
  const area = H - padTop - padBottom;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="bee-fill flex min-h-0 flex-col gap-2">
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((name, i) => (
            <span key={name} className="bee-caption inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: level(tone, i) }} />
              {name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="bee-fill relative w-full" style={{ minHeight }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 block"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left) / slot))));
          }}
        >
          {points.map((p, i) => {
            const x = i * slot + gap / 2;
            let y = H - padBottom;
            const dim = hover !== null && hover !== i;
            return (
              <g key={`${p.label}-${i}`} opacity={dim ? 0.5 : 1}>
                {totals[i] === 0 && <rect x={x} y={H - padBottom - 2} width={bw} height={2} rx={1} fill={REST} />}
                {p.parts.map((v, k) => {
                  if (v <= 0) return null;
                  const h = (v / max) * area;
                  y -= h;
                  return <rect key={k} className="bee-bar-fill" x={x} y={y} width={bw} height={h} fill={level(tone, k)} />;
                })}
                {i % every === 0 && (
                  <text x={x + bw / 2} y={H - 5} textAnchor={i === 0 ? "start" : "middle"} fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && hover !== null && (
          <div
            className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1.5 text-xs text-[var(--color-card)] ${
              (hover + 0.5) / n > 0.8 ? "-translate-x-full" : (hover + 0.5) / n < 0.2 ? "" : "-translate-x-1/2"
            }`}
            style={{ left: hover * slot + slot / 2, top: Math.max(0, H - padBottom - (totals[hover] / max) * area - 8), transform: undefined }}
          >
            <p className="font-semibold">
              {active.label} · {formatValue(totals[hover])}
            </p>
            {legend.map((name, k) =>
              active.parts[k] > 0 ? (
                <p key={name} className="opacity-80">
                  {name} · {formatValue(active.parts[k])}
                </p>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
