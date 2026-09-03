"use client";

import { AlertTriangle, DollarSign, TrendingUp, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ForecastBarChart } from "@/components/forecast/forecast-bar-chart";
import { ScenarioSimulatorPanel } from "@/components/forecast/scenario-simulator-panel";
import { TrendsChart } from "@/components/forecast/trends-chart";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { WinLossView } from "@/features/win-loss/win-loss-view";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { formatCurrencyUSD } from "@/lib/i18n/format";
import { computeForecast, qualificationScore } from "@/lib/forecast";
import { computeMonthlyTrends } from "@/lib/trends";

/** Pronóstico de ingresos — pipeline ponderado por probabilidad de cierre,
 *  deals en riesgo, el simulador de escenarios "qué pasaría si", y
 *  Ganado/Perdido: mismo motor financiero, tres ángulos sobre el mismo
 *  pipeline, en una sola fila de pestañas (antes tres filas del sidebar,
 *  luego dos filas de pestañas anidadas — ver lib/nav-items.ts). Tanto
 *  /dashboard/win-loss como el viejo simulador siguen resolviendo acá vía
 *  redirect a ?tab=winloss / ?tab=forecast. */
export function ForecastView() {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 200);
  const { data: companiesResult } = useCompanies(200);
  const { openOpportunity } = useOpportunityDrawer();

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));

  const today = new Date();
  const forecast = computeForecast(opportunities, today, locale);
  const trends = computeMonthlyTrends(opportunities, today, 6, locale);
  const withAmount = opportunities.some((o) => o.amount !== null);
  const hasClosedHistory = trends.some((t) => t.won + t.lost > 0);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">{t("forecast.title")}</h1>
            <p className="bee-caption mt-1">{t("forecast.subtitle")}</p>
          </div>
          <Badge variant={live ? "success" : "warning"}>{live ? t("liveBadge") : t("demoBadge")}</Badge>
        </div>
      </header>

      <MergedPageTabs
        defaultValue="forecast"
        tabs={[
          {
            value: "forecast",
            label: t("forecast.tabs.forecast"),
            content: isLoading ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
                <Skeleton className="h-56" />
              </div>
            ) : !withAmount ? (
              <div className="bee-bento bee-bento-pad py-12 text-center">
                <p className="text-sm text-muted-foreground">{t("forecast.emptyState.title")}</p>
                <p className="bee-caption mt-1">{t("forecast.emptyState.subtitle")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label={t("forecast.kpis.pipeline.label")}
                    value={formatCurrencyUSD(forecast.pipelineValue, locale)}
                    hint={t("forecast.kpis.pipeline.hint", { count: forecast.openCount })}
                    icon={DollarSign}
                  />
                  <MetricCard
                    label={t("forecast.kpis.weighted.label")}
                    value={formatCurrencyUSD(forecast.weightedForecast, locale)}
                    hint={
                      forecast.scoreBucketStats.length > 0
                        ? t("forecast.kpis.weighted.hintHistorical")
                        : t("forecast.kpis.weighted.hintDefault")
                    }
                    icon={TrendingUp}
                  />
                  <MetricCard
                    label={t("forecast.kpis.won.label")}
                    value={formatCurrencyUSD(forecast.wonValue, locale)}
                    hint={t("forecast.kpis.won.hint")}
                    icon={Trophy}
                  />
                  <MetricCard
                    label={t("forecast.kpis.atRisk.label")}
                    value={forecast.atRisk.length}
                    hint={t("forecast.kpis.atRisk.hint")}
                    icon={AlertTriangle}
                    tone={forecast.atRisk.length > 0 ? "warm" : "default"}
                  />
                </div>

                <section className="bee-surface bee-bento-pad">
                  <h3 className="bee-card-title">{t("forecast.byMonth.title")}</h3>
                  <p className="bee-caption mb-4">{t("forecast.byMonth.caption")}</p>
                  <ForecastBarChart buckets={forecast.byMonth} />
                </section>

                {hasClosedHistory && (
                  <section className="bee-surface bee-bento-pad">
                    <h3 className="bee-card-title">{t("forecast.trend.title")}</h3>
                    <p className="bee-caption mb-4">{t("forecast.trend.caption")}</p>
                    <TrendsChart points={trends} />
                  </section>
                )}

                {forecast.scoreBucketStats.length > 0 && (
                  <section className="bee-surface bee-bento-pad">
                    <h3 className="bee-card-title">{t("forecast.accuracy.title")}</h3>
                    <p className="bee-caption mb-4">{t("forecast.accuracy.caption")}</p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                      {forecast.scoreBucketStats.map((s) => (
                        <div key={s.bucketStart} className="bee-bento p-3 text-center">
                          <p className="bee-kpi-tile__label">
                            {t("forecast.accuracy.scoreLabel", {
                              start: s.bucketStart,
                              end: s.bucketStart + 19,
                            })}
                          </p>
                          <p className="bee-kpi-sm mt-1">{Math.round(s.winRate * 100)}%</p>
                          <p className="bee-micro">
                            {t("forecast.accuracy.sampleSize", { count: s.sampleSize })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="bee-surface bee-bento-pad">
                  <h3 className="bee-card-title">{t("forecast.atRiskSection.title")}</h3>
                  <p className="bee-caption mb-3">{t("forecast.atRiskSection.caption")}</p>
                  {forecast.atRisk.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("forecast.atRiskSection.empty")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {forecast.atRisk.map(({ opportunity, reason }) => {
                        const company = opportunity.company_id
                          ? companyById.get(opportunity.company_id)
                          : undefined;
                        return (
                          <li key={opportunity.id}>
                            <button
                              type="button"
                              onClick={() => openOpportunity(opportunity.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-primary)]/30"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">
                                  {stripOpportunityTitlePrefix(opportunity.title)}
                                </p>
                                <p className="truncate bee-micro">
                                  {company?.name ?? t("forecast.atRiskSection.noCompany")} ·{" "}
                                  {t("forecast.atRiskSection.qualifiedPercent", {
                                    percent: Math.round(
                                      qualificationScore(opportunity.qualification) * 100,
                                    ),
                                  })}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-chart-1)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--color-chart-1)]">
                                {t(`forecast.atRiskSection.riskLabels.${reason}`)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            ),
          },
          {
            value: "winloss",
            label: t("forecast.outerTabs.winLoss"),
            content: <WinLossView showHeader={false} />,
          },
          {
            value: "simulator",
            label: t("forecast.tabs.simulator"),
            content: <ScenarioSimulatorPanel />,
          },
        ]}
      />
    </div>
  );
}
