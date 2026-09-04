"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { clamp01, onScrollFrame, prefersReducedMotion } from "@/components/marketing-motion";

/**
 * MarketingScrollGauge — a 28px honeycomb at the right end of the sticky
 * header that heats up with page progress: pale honey at the top of the
 * page, through honey, deep honey, indigo and lilac, to magenta at the
 * end — the same cold→hot scale the landing hive uses. Seven cells (centre
 * + ring) light one by one as well, so it reads as a progress gauge even
 * before the colour shift registers. Replaces the 2px progress bar: same
 * job, but unmistakably BEE. Clicking it scrolls back to the top.
 *
 * Geometry is literal constants (no Math.cos/sin) so the server and the
 * client emit byte-identical `points` — same reason as the landing hive.
 * Progress is quantised to 1/40 so scrolling re-renders seven polygons
 * at most 40 times over the whole page.
 */

const SIZE = 4.1;
// Flat-top hexagon unit vertices (cos/sin of 0°, 60°, …, 300°).
const COS = [1, 0.5, -0.5, -1, -0.5, 0.5] as const;
const SIN = [0, 0.8660254, 0.8660254, 0, -0.8660254, -0.8660254] as const;
// Centre first, then the ring clockwise from the top (spacing = 8 units).
const CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, -8],
  [6.93, -4],
  [6.93, 4],
  [0, 8],
  [-6.93, 4],
  [-6.93, -4],
];
const STOPS = ["--color-chart-3", "--color-chart-1", "--color-chart-2", "--color-chart-4", "--color-chart-6", "--color-chart-5"] as const;

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) pts.push(`${(cx + SIZE * COS[i]).toFixed(2)},${(cy + SIZE * SIN[i]).toFixed(2)}`);
  return pts.join(" ");
}

/** Palette colour for progress p (0 = pale honey … 1 = magenta). */
function heat(p: number): string {
  const segments = STOPS.length - 1;
  const scaled = clamp01(p) * segments;
  const idx = Math.min(segments - 1, Math.floor(scaled));
  const pct = Math.round((scaled - idx) * 100);
  return `color-mix(in srgb, var(${STOPS[idx + 1]}) ${pct}%, var(${STOPS[idx]}) ${100 - pct}%)`;
}

export function MarketingScrollGauge() {
  const t = useTranslations("marketing.header");
  const [p, setP] = useState(0);

  useEffect(
    () =>
      onScrollFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const raw = max > 0 ? window.scrollY / max : 0;
        setP(Math.round(clamp01(raw) * 40) / 40);
      }),
    [],
  );

  // Centre cell always on (pale honey at the very top); the ring fills as
  // progress grows; the whole hive shares the colour for this progress.
  const lit = Math.max(1, Math.ceil(p * CELLS.length));
  const fill = heat(p);

  return (
    <button
      type="button"
      className="bee-scroll-gauge"
      aria-label={t("backToTop")}
      title={t("backToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })}
    >
      <svg viewBox="-14 -14 28 28" width="28" height="28" aria-hidden focusable="false">
        {CELLS.map(([cx, cy], i) => (
          <polygon
            key={i}
            points={hexPoints(cx, cy)}
            fill={i < lit ? fill : "var(--color-divider)"}
            className="bee-scroll-gauge__cell"
          />
        ))}
      </svg>
    </button>
  );
}
