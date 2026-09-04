"use client";

import { useState } from "react";

import { TONE, level } from "@/components/charts/palette";

export interface RankedBar {
  label: string;
  value: number;
}

/**
 * A ranked list of horizontal bars in one hue — the top industries of the
 * directory. Rank decides the intensity (100 / 70 / 45 %, then the page
 * grey); the number appears only on hover, in the tooltip. Fills its box:
 * the rows spread evenly over whatever height the card gives them.
 */
export function IndustryBars({ rows, tone = TONE.market, formatValue = (v) => String(v) }: { rows: RankedBar[]; tone?: string; formatValue?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="bee-fill flex flex-col justify-evenly gap-3">
      {rows.map((r, i) => (
        // Hover-only enhancement: the label already names the row.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div key={r.label} className="relative grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="truncate text-sm" title={r.label}>
            {r.label}
          </span>
          <div className="h-5 w-full">
            <div
              className="h-5 rounded-[4px] transition-opacity"
              style={{ width: `${Math.max((r.value / max) * 100, 3)}%`, background: level(tone, i), opacity: hover !== null && hover !== i ? 0.5 : 1 }}
            />
          </div>
          {hover === i && (
            <div className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)]">
              {r.label} · {formatValue(r.value)}
              {total > 0 && ` · ${Math.round((r.value / total) * 100)}%`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
