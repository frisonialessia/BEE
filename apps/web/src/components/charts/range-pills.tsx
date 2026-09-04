"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * How far back a time chart looks. Every chart shows a year by default and
 * zooms out to two or five with these pills; the data behind it always
 * carries five years, the pills only move the window.
 */
export type TimeRange = "1y" | "2y" | "5y";
export const RANGE_MONTHS: Record<TimeRange, number> = { "1y": 12, "2y": 24, "5y": 60 };
export const RANGES: TimeRange[] = ["1y", "2y", "5y"];

/** The bucket a series is drawn in at each range: weeks for a year, months beyond. */
export function bucketFor(range: TimeRange): "week" | "month" {
  return range === "1y" ? "week" : "month";
}

export function useTimeRange(initial: TimeRange = "1y") {
  const [range, setRange] = useState<TimeRange>(initial);
  return { range, months: RANGE_MONTHS[range], setRange };
}

/** The zoom control that sits in a card's corner: 1 año · 2 años · 5 años. */
export function RangePills({ value, onChange, className }: { value: TimeRange; onChange: (r: TimeRange) => void; className?: string }) {
  const t = useTranslations("shared.range");
  return (
    <div role="group" aria-label={t("aria")} className={className ?? "flex items-center gap-1"}>
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className="bee-btn-ghost bee-drawer-pill !h-7 !min-w-0 !px-2.5 !text-xs"
        >
          {t(r)}
        </button>
      ))}
    </div>
  );
}
