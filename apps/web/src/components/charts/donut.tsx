"use client";

import { SERIES } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

/** Mix of a whole: total in the centre, legend with percentages. ≤ 4
 *  slices in the fixed series order; the rest folds into "Otros". */
export function Donut({
  slices,
  size: sizeProp,
  centerLabel,
  otherLabel = "Otros",
}: {
  slices: DonutSlice[];
  /** Fixed diameter; omit to size from the box (clamped 96–176px). */
  size?: number;
  centerLabel?: string;
  otherLabel?: string;
}) {
  const [ref, box] = useBoxSize<HTMLDivElement>({ width: 320, height: 140 });
  const size = sizeProp ?? Math.round(Math.max(96, Math.min(176, box.height - 8, box.width * 0.42)));
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((s, x) => s + x.value, 0);
  const parts = rest > 0 ? [...top, { label: otherLabel, value: rest, color: "var(--color-primary)" }] : top;
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <p ref={ref} className="bee-caption py-6 text-center">—</p>;
  const stroke = 12;
  const r = (size - stroke - 2) / 2;
  const c = 2 * Math.PI * r;
  const offsets = parts.reduce<number[]>((acc, p, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + c * (parts[i - 1].value / total));
    return acc;
  }, []);
  return (
    <div ref={ref} className="bee-fill flex w-full min-w-0 items-center gap-4" style={{ minHeight: 120 }}>
      <svg width={size} height={size} className="shrink-0">
        {parts.map((p, i) => {
          const frac = p.value / total;
          return (
            <circle
              key={p.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color ?? SERIES[i % SERIES.length]}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, c * frac - 2)} ${c}`}
              strokeDashoffset={-offsets[i]}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${p.label} · ${Math.round(frac * 100)}%`}</title>
            </circle>
          );
        })}
        <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontWeight={700} fill="var(--color-text)" style={{ fontSize: size >= 140 ? "var(--bee-fs-subtitle)" : "var(--bee-fs-body)" }}>
          {centerLabel ?? total}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {parts.map((p, i) => (
          <li key={p.label} className="flex min-w-0 items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <b className="shrink-0 pl-2 tabular-nums">{Math.round((p.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
