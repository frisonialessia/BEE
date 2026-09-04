"use client";

import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MeddicBucketStat } from "@/lib/win-loss";

/** ¿Calificar más de verdad se traduce en más cierres ganados? Tasa de
 *  cierre real por nivel de calificación MEDDIC, no una suposición —
 *  mismo patrón visual que TrendsChart (barra + tasa arriba), con un
 *  tooltip real (Radix) en vez del title nativo del navegador. */
export function MeddicCorrelationChart({ stats }: { stats: MeddicBucketStat[] }) {
  const t = useTranslations("forecastWinLoss.meddicChart");
  const anyData = stats.some((s) => s.won + s.lost > 0);
  if (!anyData) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{t("empty")}</p>;
  }

  const maxTotal = Math.max(1, ...stats.map((s) => s.won + s.lost));

  return (
    <div className="bee-fill flex min-h-[160px] items-end gap-4">
      {stats.map((s) => {
        const total = s.won + s.lost;
        const pct = (total / maxTotal) * 100;
        return (
          <div key={s.bucketLabel} className="flex h-full flex-1 flex-col items-center gap-2">
            <p className="h-4 bee-micro font-medium">
              {s.winRate !== null ? `${Math.round(s.winRate * 100)}%` : "—"}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)] transition-[height] duration-300"
                    style={{ height: `${Math.max(pct, total > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("tooltip", { label: s.bucketLabel, won: s.won, lost: s.lost })}
              </TooltipContent>
            </Tooltip>
            <p className="bee-micro font-medium">{s.bucketLabel}</p>
          </div>
        );
      })}
    </div>
  );
}
