"use client";

import { useState } from "react";

import { DATA } from "@/components/charts/palette";

export interface FunnelRow {
  label: string;
  value: number;
  color?: string;
}

/** How many items sit in each stage: label, thin bar, number at the end.
 *  Hovering a row shows its value and share of the total. */
export function HorizontalFunnel({ rows, formatValue = (v) => String(v) }: { rows: FunnelRow[]; formatValue?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="bee-fill flex flex-col justify-evenly gap-2">
      {rows.map((r, i) => (
        // Hover-only enhancement: value and label are already printed in the row.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          key={r.label}
          className="relative grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="truncate">{r.label}</span>
          <div className="h-5 w-full">
            <div
              className="h-5 rounded-[4px] transition-opacity"
              style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 3 : 0)}%`, background: r.color ?? DATA.indigo, opacity: hover !== null && hover !== i ? 0.45 : 1 }}
            />
          </div>
          <span className="w-10 text-right font-semibold tabular-nums">{formatValue(r.value)}</span>
          {hover === i && total > 0 && (
            <div className="pointer-events-none absolute right-12 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)]">
              {r.label} · {formatValue(r.value)} · {Math.round((r.value / total) * 100)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
