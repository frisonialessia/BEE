"use client";

import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import { formatCurrencyUSD } from "@/lib/i18n/format";
import type { ForecastMonthBucket } from "@/lib/forecast";

/** Barras de pronóstico ponderado por mes — sin librería de gráficas, como
 *  el resto de la BI de BEE. Cada barra muestra el total del pipeline en un
 *  tono tenue y, encima, la porción ponderada por probabilidad de cierre.
 *  El tooltip es real (Radix), no el title nativo del navegador. */
export function ForecastBarChart({ buckets }: { buckets: ForecastMonthBucket[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss.barChart");
  const maxValue = Math.max(1, ...buckets.map((b) => b.total));

  return (
    // Legend below the bars on a phone, beside them from sm up — side by
    // side it ate ~90px of a 335px card and pushed the first bar's label
    // off the left edge.
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex w-full min-w-0 items-end gap-2 pb-1 sm:flex-1 sm:gap-3" style={{ height: "var(--bee-chart-h)" }}>
      {buckets.map((b, i) => {
        const totalPct = (b.total / maxValue) * 100;
        const weightedPct = (b.weighted / maxValue) * 100;
        return (
          <div key={b.key} className="flex h-full min-w-5 flex-1 flex-col items-center gap-2 sm:min-w-12">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)] transition-[height]"
                    style={{ height: `${Math.max(totalPct, 2)}%` }}
                  />
                  <div
                    className="absolute bottom-0 w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-2)] transition-[height]"
                    style={{ height: `${Math.max(weightedPct, b.weighted > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("tooltip", {
                  label: b.label,
                  weighted: formatCurrencyUSD(b.weighted, locale),
                  total: formatCurrencyUSD(b.total, locale),
                  count: b.count,
                })}
              </TooltipContent>
            </Tooltip>
            {/* Twelve month labels don't fit a phone-width card (the row
                scrolled sideways with no visible scrollbar) — every other
                label below sm, all of them above. */}
            <p className={cn("bee-micro whitespace-nowrap font-medium", i % 2 === 1 && "hidden sm:block")}>
              {b.label}
            </p>
          </div>
        );
      })}
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-2 bee-micro sm:ml-2 sm:flex-col sm:justify-end sm:pb-4">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-sm bg-[var(--color-chart-2)]" /> {t("legendWeighted")}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-sm bg-[var(--color-chart-4)]" /> {t("legendTotal")}
        </span>
      </div>
    </div>
  );
}
