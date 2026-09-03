import type { LucideIcon } from "lucide-react";

import { Sparkline } from "@/components/sparkline";

/** KPI tile — the one stat-tile pattern in the app: number centered on top,
 *  label beneath, optional hint line and sparkline. Tone is a border color,
 *  never a fill (only signal cards are colored). */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warm" | "muted";
  /** Serie diaria opcional (ej. últimos 7 días) — dibuja una mini-tendencia. */
  trend?: number[];
}) {
  const toneClass = tone === "warm" ? "bee-outline--warm" : tone === "muted" ? "bee-outline--magenta" : "";

  return (
    <div className={`bee-bento relative p-4 text-center ${toneClass}`}>
      {Icon && <Icon className="absolute right-3 top-3 size-3.5 text-muted-foreground stroke-[1.25]" />}
      <p className="bee-stat__val">{value}</p>
      <p className="bee-stat__lbl mt-1">{label}</p>
      {trend && trend.length >= 2 && (
        <div className="mt-2 flex justify-center">
          <Sparkline values={trend} className="text-[var(--color-chart-4)]" />
        </div>
      )}
      {hint && <p className="bee-caption mt-1">{hint}</p>}
    </div>
  );
}
