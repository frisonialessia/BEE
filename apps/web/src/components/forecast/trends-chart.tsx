"use client";

import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MonthlyTrendPoint } from "@/lib/trends";

/** Creadas vs. tasa de cierre mes a mes — sin librería de gráficas, como el
 *  resto de la BI de BEE. La barra es el volumen creado; el número arriba es
 *  la tasa de cierre de lo que se resolvió ese mes (gana / (gana + pierde)),
 *  no de lo creado — un mes puede crear mucho y cerrar poco, son cosas
 *  distintas y mezclarlas sería engañoso. Tooltip real (Radix), no el title
 *  nativo del navegador. */
export function TrendsChart({ points }: { points: MonthlyTrendPoint[] }) {
  const t = useTranslations("forecastWinLoss");
  const maxCreated = Math.max(1, ...points.map((p) => p.created));

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: "var(--bee-chart-h)" }}>
      {points.map((p) => {
        const pct = (p.created / maxCreated) * 100;
        return (
          <div key={p.key} className="flex h-full min-w-12 flex-1 flex-col items-center gap-2">
            <p className="h-4 bee-micro font-medium">
              {p.winRate !== null ? `${Math.round(p.winRate * 100)}%` : "—"}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)] transition-[height] duration-300"
                    style={{ height: `${Math.max(pct, p.created > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("trendsChart.tooltip", { label: p.label, created: p.created, won: p.won, lost: p.lost })}
              </TooltipContent>
            </Tooltip>
            <p className="bee-micro font-medium">{p.label}</p>
          </div>
        );
      })}
    </div>
  );
}
