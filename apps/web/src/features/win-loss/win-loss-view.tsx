"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { TONE, level } from "@/components/charts/palette";
import { RangePills, useTimeRange } from "@/components/charts/range-pills";
import { StackedBars, type StackedPoint } from "@/components/charts/stacked-bars";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitorBreakdown } from "@/components/win-loss/competitor-breakdown";
import { LossReasonChart } from "@/components/win-loss/loss-reason-chart";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { computeMonthlyTrends } from "@/lib/trends";
import { computeWinLoss } from "@/lib/win-loss";

/** Ganado/Perdido — por qué se ganan y se pierden los deals, no solo cuántos.
 *  Todo calculado en el cliente a partir de las oportunidades ya cargadas
 *  (mismo patrón que Pronóstico) — nada nuevo del lado del backend salvo
 *  los dos campos que el rep llena al cerrar un deal (razón de pérdida,
 *  competidor) desde el panel del drawer.
 *
 *  Three boxes: won vs lost by month (honey, six months), loss reasons by
 *  rank (lilac), and the competitors we actually meet at close (rows).
 *  The KPI strip is the page's, shared with the projection tab. */
export function WinLossView() {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss.winLoss");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const [today] = useState(() => new Date());
  const { range, months, setRange } = useTimeRange();

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const summary = useMemo(() => computeWinLoss(opportunities), [opportunities]);
  const trends = useMemo(() => computeMonthlyTrends(opportunities, today, months, locale), [opportunities, today, months, locale]);

  // Won at full honey, lost at the softest level: parts[1] is always empty
  // so StackedBars skips the middle intensity and never draws its legend
  // entry (the legend below is ours, two dots).
  const monthly = useMemo<StackedPoint[]>(
    () => trends.map((p, i) => ({ label: p.label, parts: [p.won, 0, p.lost], current: i === trends.length - 1 })),
    [trends],
  );
  const hasMonthly = trends.some((p) => p.won + p.lost > 0);
  const monthlyLegend = [t("monthly.won"), "", t("monthly.lost")];

  if (isLoading) return <Skeleton className="h-96 rounded-[var(--radius-lg)]" />;
  if (summary.totalClosed === 0) return <p className="bee-caption py-8 text-center">{t("emptyState.title")}</p>;

  const monthlyCaption =
    summary.winRate !== null
      ? t("monthly.captionRate", { won: summary.won, total: summary.totalClosed, rate: Math.round(summary.winRate * 100) })
      : t("monthly.caption");

  return (
    <div className="space-y-6">
      <div className="bee-overview">
        <OverviewCard span={6} title={t("monthly.title")} caption={monthlyCaption} action={<RangePills value={range} onChange={setRange} />}>
          {hasMonthly ? (
            <div className="bee-fill flex min-h-0 flex-col gap-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[0, 2].map((k) => (
                  <span key={k} className="bee-caption inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: level(TONE.market, k) }} />
                    {monthlyLegend[k]}
                  </span>
                ))}
              </div>
              <StackedBars points={monthly} legend={monthlyLegend} tone={TONE.market} minHeight={160} showLegend={false} />
            </div>
          ) : (
            <p className="bee-caption py-6 text-center">{t("monthly.empty")}</p>
          )}
        </OverviewCard>
        <OverviewCard span={6} title={t("reasons.title")} caption={t("reasons.caption")}>
          <LossReasonChart stats={summary.reasonBreakdown} />
        </OverviewCard>
      </div>

      {/* Competitors — a list, so its box is as tall as its rows (own grid
          with auto rows: a 12-wide list must not reserve the 18rem floor). */}
      <div className="bee-overview" style={{ gridAutoRows: "auto" }}>
        <OverviewCard span={12} title={t("competitors.title")} caption={t("competitors.caption")}>
          <CompetitorBreakdown stats={summary.competitorBreakdown} />
        </OverviewCard>
      </div>
    </div>
  );
}
