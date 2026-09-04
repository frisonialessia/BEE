"use client";

import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { hexagonPath } from "@/lib/visualization/honeycomb-radial";

/**
 * A small hexagon + a number — consecutive days the team has closed at
 * least one deal, ending today (or yesterday, while today is still in
 * progress). Never a warning color, never resets to a red state: on a
 * quiet day it just reads zero, in the same ink every other count in the
 * app uses. Sits in a card's `action` slot, so it never touches the
 * `.bee-overview` grid math.
 */
export function StreakBadge({ days }: { days: number }) {
  const t = useTranslations("celebration.streak");
  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] px-2.5 py-1"
      title={days > 0 ? t("hint", { days }) : t("hintZero")}
    >
      <svg width="12" height="12" viewBox="-7 -7 14 14" aria-hidden>
        <path d={hexagonPath(0, 0, 7)} fill={days > 0 ? TONE.marketDeep : "var(--color-border)"} />
      </svg>
      <span className="bee-micro font-semibold tabular-nums text-[var(--color-text)]">{days}</span>
    </span>
  );
}
