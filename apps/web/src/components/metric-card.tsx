"use client";

import type { LucideIcon } from "lucide-react";

import { useTranslations } from "next-intl";

import { DATA, SERIES } from "@/components/charts/palette";
import { StatTile } from "@/components/charts/stat-tile";
import { cn } from "@/lib/utils";

/**
 * KPI tile — the one stat tile in the app. Since the charts pass it is a
 * thin alias of `StatTile` (chip label, number, delta or hint, sparkline or
 * ring) so a strip on Pronóstico looks exactly like the one on Resumen or
 * Ventas. Tone comes from the fixed data series by position; `tone` picks a
 * specific hue when a figure carries a state (warm = honey for at-risk).
 * `icon` and `accent` are accepted for compatibility and no longer drawn:
 * the chip dot and the sparkline color already say what the icon did, and
 * the green/red accents are gone by design (BEE warns in honey, never red;
 * green lives on Ventas only).
 */
export interface MetricItem {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warm" | "muted" | "blue";
  /** @deprecated kept for call sites; tiles take their tone from the series. */
  accent?: string;
  /** Daily series (e.g. last 7 days) — draws a mini trend on the right. */
  trend?: number[];
  /** 0–1: draws a progress ring instead of the sparkline. */
  progress?: number;
  /** Fraction vs. the previous period (0.32 = +32 %). */
  delta?: number | null;
  deltaLabel?: string;
  /** Hide on phones so a 5-tile strip stays 2×2 instead of 2×2+1. */
  hideOnMobile?: boolean;
  className?: string;
}

const TONE_COLOR: Record<NonNullable<MetricItem["tone"]>, string | null> = {
  default: null,
  warm: DATA.honey,
  muted: DATA.magenta,
  blue: DATA.indigo,
};

export function MetricCard({ label, value, hint, tone = "default", trend, progress, delta, deltaLabel, hideOnMobile, className, seriesIndex = 0 }: MetricItem & { seriesIndex?: number }) {
  return (
    <StatTile
      label={label}
      value={value}
      hint={hint}
      trend={trend}
      progress={progress}
      delta={delta}
      deltaLabel={deltaLabel}
      tone={TONE_COLOR[tone] ?? SERIES[seriesIndex % SERIES.length]}
      className={cn(hideOnMobile && "hidden md:flex", className)}
    />
  );
}

const COLS_CLASS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
};

/**
 * The KPI strip every page opens with — one grid, one tile, one gap. Two
 * columns on phones (never a single stretched tile), the requested count
 * from tablet up. A counter at 0 is not a tile: it's dropped (`hideZero`,
 * on by default), and when every counter is 0 the strip collapses to one
 * quiet line instead of a row of empty boxes.
 */
export function KpiStrip({
  items,
  cols,
  hideZero = true,
  className,
}: {
  items: MetricItem[];
  cols?: 2 | 3 | 4 | 5 | 6;
  hideZero?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.kpi");
  const visible = hideZero ? items.filter((i) => i.value !== 0 && i.value !== "0") : items;
  if (visible.length === 0) {
    return <p className="bee-caption">{t("allZero")}</p>;
  }
  // Columns follow what is actually shown: two survivors of a four-tile
  // strip fill the row instead of leaving half of it empty.
  const count = Math.min(cols ?? 6, Math.max(2, visible.length)) as 2 | 3 | 4 | 5 | 6;
  return (
    <div className={cn("grid gap-4", COLS_CLASS[count], className)}>
      {visible.map((item, i) => (
        <MetricCard key={item.label} {...item} seriesIndex={i} />
      ))}
    </div>
  );
}
