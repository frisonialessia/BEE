import type { LucideIcon } from "lucide-react";
import { Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export interface DashboardKpi {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
}

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  live: boolean;
  kpis: DashboardKpi[];
  eyebrow?: string;
}

export function DashboardHeader({
  title,
  subtitle,
  live,
  kpis,
  eyebrow = "Signal Intelligence",
}: DashboardHeaderProps) {
  return (
    <header className="bee-topbar">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{eyebrow}</p>
          <h1 className="bee-display mt-1">{title}</h1>
          <p className="bee-caption mt-1 max-w-xl">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={live ? "success" : "warning"}>
            {live ? "Live · API connected" : "Demo · API offline"}
          </Badge>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <Bot className="size-3.5" />
            Strategy · rule_based
          </span>
        </div>
      </div>

      <div className="bee-kpi-strip">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bee-kpi-tile">
            <div className="flex items-center justify-between gap-2">
              <span className="bee-kpi-tile__label">{kpi.label}</span>
              {kpi.icon && (
                <kpi.icon className="size-3.5 text-muted-foreground stroke-[1.25]" />
              )}
            </div>
            <div className="bee-kpi-tile__value">{kpi.value}</div>
            {kpi.hint && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{kpi.hint}</p>
            )}
          </div>
        ))}
      </div>
    </header>
  );
}
