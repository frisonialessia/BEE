"use client";

import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CompetitorStat } from "@/lib/win-loss";

/** Por competidor: cuántas veces le ganamos y cuántas nos ganó — la lista de
 *  "contra quién competimos de verdad", no solo el nombre suelto que hoy vive
 *  enterrado en `notes` de texto libre. */
export function CompetitorBreakdown({ stats }: { stats: CompetitorStat[] }) {
  const t = useTranslations("forecastWinLoss.competitorBreakdown");

  if (stats.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="bee-fill flex min-h-[160px] flex-col justify-evenly gap-2">
      {stats.map((s) => {
        const total = s.wins + s.losses;
        const winPct = total > 0 ? (s.wins / total) * 100 : 0;
        return (
          <div key={s.competitor}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium">{s.competitor}</p>
              <p className="shrink-0 bee-micro">{t("record", { wins: s.wins, losses: s.losses })}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--color-primary)]/20">
                  <div
                    className="h-full bg-[var(--color-green-1)] transition-[width] duration-300"
                    style={{ width: `${winPct}%` }}
                  />
                  <div
                    className="h-full bg-[var(--color-chart-2)]/70 transition-[width] duration-300"
                    style={{ width: `${100 - winPct}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("tooltip", { competitor: s.competitor, percent: Math.round(winPct), count: total })}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
