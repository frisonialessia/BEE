"use client";

import { Sparkles, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import type { Locale } from "@/i18n/locales";
import { formatCurrencyUSDCompact } from "@/lib/i18n/format";
import type { TodayImpact } from "@/lib/today-impact";
import { useDashboardBase } from "@/lib/demo/mode";

/** "Si actúas hoy…" — el número que abre la mañana. Nunca inventa una
 *  cifra: si no hay suficiente histórico de cierre o ningún monto cargado
 *  en las oportunidades, cae a un mensaje honesto en vez de un $0 o un
 *  estimado disfrazado de medición. Ver `computeTodayImpact`. */
export function TodayImpactCard({ impact }: { impact: TodayImpact }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.todayImpact");
  const base = useDashboardBase();
  const { hotSignalsToday, projectedUplift, winRate, avgDealValue, winRateSampleSize } = impact;

  if (hotSignalsToday.length === 0) {
    return (
      <section className="bee-glass rounded-[var(--radius-lg)] bee-bento-pad mb-4 flex items-center gap-3">
        <Sparkles className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
      </section>
    );
  }

  return (
    <section className="bee-glass bee-glass--hover rounded-[var(--radius-lg)] bee-bento-pad mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-chart-5)]/20">
            <TrendingUp className="size-4.5" style={{ color: "var(--color-chart-5)" }} />
          </span>
          <div>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            {projectedUplift !== null ? (
              <>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {t("upliftHeadline", { amount: formatCurrencyUSDCompact(projectedUplift, locale) })}
                </p>
                <p className="bee-caption mt-1">
                  {t("upliftDetail", {
                    count: hotSignalsToday.length,
                    winRate: Math.round((winRate ?? 0) * 100),
                    sampleSize: winRateSampleSize,
                    avgDealValue: formatCurrencyUSDCompact(avgDealValue ?? 0, locale),
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {t("signalsHeadline", { count: hotSignalsToday.length })}
                </p>
                <p className="bee-caption mt-1">
                  {winRateSampleSize < 5
                    ? t("needMoreDeals", { sampleSize: winRateSampleSize })
                    : t("addDealValue")}
                </p>
              </>
            )}
          </div>
        </div>
        <Link href={`${base}/signals?tab=priority`} className="bee-btn-ghost shrink-0 text-xs">
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
