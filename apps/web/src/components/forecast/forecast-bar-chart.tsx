"use client";

import { useLocale, useTranslations } from "next-intl";

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
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: "var(--bee-chart-h)" }}>
      {buckets.map((b) => {
        const totalPct = (b.total / maxValue) * 100;
        const weightedPct = (b.weighted / maxValue) * 100;
        return (
          <div key={b.key} className="flex h-full w-16 shrink-0 flex-col items-center gap-1.5">
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
            <p className="bee-micro font-medium">{b.label}</p>
          </div>
        );
      })}
      <div className="ml-2 flex shrink-0 flex-col justify-end gap-1.5 pb-4 bee-micro">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[var(--color-chart-2)]" /> {t("legendWeighted")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[var(--color-chart-4)]" /> {t("legendTotal")}
        </span>
      </div>
    </div>
  );
}
