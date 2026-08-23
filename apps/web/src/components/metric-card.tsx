import type { LucideIcon } from "lucide-react";

import { Sparkline } from "@/components/sparkline";

/** Compact KPI tile for inline bento grids. */
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
  const toneClass =
    tone === "warm"
      ? "bee-bento--warm"
      : tone === "muted"
        ? "bee-bento--muted"
        : "";

  return (
    <div className={`bee-bento bee-bento-pad ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="bee-kpi-tile__label">{label}</span>
        {Icon && <Icon className="size-3.5 text-muted-foreground stroke-[1.25]" />}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="bee-kpi mt-2">{value}</div>
        {trend && trend.length >= 2 && (
          <Sparkline values={trend} className="mb-0.5 shrink-0 text-[var(--color-chart-4)]" />
        )}
      </div>
      {hint && <p className="bee-caption mt-1">{hint}</p>}
    </div>
  );
}
