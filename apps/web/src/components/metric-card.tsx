"use client";

import type { LucideIcon } from "lucide-react";

import { useTranslations } from "next-intl";

import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

/**
 * KPI tile — the one stat tile in the app, and a compact one: number on
 * top, label beneath, ~56px tall (py-2), so a strip of them sits above the
 * fold without pushing the real content down. Tone is a border color,
 * never a fill (only signal cards are colored); `accent` colors the number
 * itself when a figure carries a state (at-risk count, errors).
 */
export interface MetricItem {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warm" | "muted" | "blue";
  /** CSS color for the value (e.g. "var(--color-chart-1)"). */
  accent?: string;
  /** Daily series (e.g. last 7 days) — draws a mini trend under the label. */
  trend?: number[];
  /** Hide on phones so a 5-tile strip stays 2×2 instead of 2×2+1. */
  hideOnMobile?: boolean;
  className?: string;
}

const TONE_CLASS: Record<NonNullable<MetricItem["tone"]>, string> = {
  default: "",
  warm: "bee-outline--warm",
  muted: "bee-outline--magenta",
  blue: "bee-outline--blue",
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  accent,
  trend,
  hideOnMobile,
  className,
}: MetricItem) {
  return (
    <div
      className={cn(
        "bee-bento relative flex h-full min-w-0 flex-col items-center justify-center px-3 py-2 text-center",
        TONE_CLASS[tone],
        hideOnMobile && "hidden md:flex",
        className,
      )}
    >
      {Icon && <Icon className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground stroke-[1.25]" />}
      <p className="bee-stat__val truncate" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      <p className="bee-stat__lbl mt-0.5 line-clamp-2">{label}</p>
      {trend && trend.length >= 2 && (
        <div className="mt-1 flex justify-center">
          <Sparkline values={trend} className="text-[var(--color-chart-4)]" />
        </div>
      )}
      {hint && <p className="bee-caption mt-0.5 line-clamp-1">{hint}</p>}
    </div>
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
      {visible.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </div>
  );
}
