"use client";

import { useTranslations } from "next-intl";

import { TONE, tint } from "@/components/charts/palette";

const AXIS_KEYS = ["d", "i", "s", "c"] as const;

// The I/C axis labels sit past the ring with a "start"/"end" text-anchor,
// so their text extends outward in ONE direction; SIZE keeps real margin
// around the radar for a word like "Influencia" to fit without clipping.
const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 92;
const RINGS = [0.25, 0.5, 0.75, 1];
const AXIS_STROKE = "color-mix(in srgb, var(--color-text) 12%, transparent)";

function axisPoint(index: number, fraction: number) {
  // Empieza arriba (D) y va en sentido horario — D, I, S, C.
  const angle = -Math.PI / 2 + index * (Math.PI / 2);
  return {
    x: CENTER + Math.cos(angle) * RADIUS * fraction,
    y: CENTER + Math.sin(angle) * RADIUS * fraction,
  };
}

/**
 * DiscRadar — a DISC communication profile on its four real axes
 * (D/I/S/C). One series, one polygon: the hue at 45 % as the fill and at
 * 100 % as the stroke, rings and axes in ink at 12 %. No legend — each
 * axis label names its value, and the number itself lives in the vertex's
 * hover title, never on the chart. Scales to its box (viewBox).
 */
export function DiscRadar({
  d,
  i,
  s,
  c,
  tone = TONE.urgency,
  className = "h-full w-full",
}: {
  d: number;
  i: number;
  s: number;
  c: number;
  /** The one hue the polygon wears. */
  tone?: string;
  className?: string;
}) {
  const t = useTranslations("shared.discRadar");
  const values = [d, i, s, c];
  const points = values.map((v, idx) => axisPoint(idx, Math.max(0, Math.min(1, v))));
  const areaPath = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")} Z`;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} role="img" aria-label={t("ariaLabel")}>
      {RINGS.map((r) => {
        const ringPoints = AXIS_KEYS.map((_, idx) => axisPoint(idx, r));
        const path = `M${ringPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")} Z`;
        return <path key={r} d={path} fill="none" stroke={AXIS_STROKE} strokeWidth={1} />;
      })}

      {AXIS_KEYS.map((key, idx) => {
        const outer = axisPoint(idx, 1);
        return <line key={key} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} stroke={AXIS_STROKE} strokeWidth={1} />;
      })}

      <path d={areaPath} fill={tint(tone, 45)} stroke={tone} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, idx) => (
        <circle key={idx} cx={p.x} cy={p.y} r={4} fill={tone} stroke="var(--color-card)" strokeWidth={1.5}>
          <title>
            {t(`axes.${AXIS_KEYS[idx]}`)} · {Math.round(values[idx] * 100)}%
          </title>
        </circle>
      ))}

      {AXIS_KEYS.map((key, idx) => {
        const labelPos = axisPoint(idx, 1.16);
        const anchor = idx === 1 ? "start" : idx === 3 ? "end" : "middle";
        return (
          <text key={key} x={labelPos.x} y={labelPos.y} textAnchor={anchor} dominantBaseline="middle" fill="var(--color-text-muted)" style={{ fontSize: 12, fontWeight: 500 }}>
            {t(`axes.${key}`)}
          </text>
        );
      })}
    </svg>
  );
}
