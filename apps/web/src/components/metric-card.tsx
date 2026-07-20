import type { LucideIcon } from "lucide-react";

/** Compact KPI tile for inline bento grids. */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warm" | "muted";
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
      <div className="bee-kpi mt-2">{value}</div>
      {hint && <p className="bee-caption mt-1">{hint}</p>}
    </div>
  );
}
