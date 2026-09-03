"use client";

import { useLocale, useTranslations } from "next-intl";

import { ForecastBarChart } from "@/components/forecast/forecast-bar-chart";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { ScenarioSimulatorPanel } from "@/components/forecast/scenario-simulator-panel";
import { TrendsChart } from "@/components/forecast/trends-chart";
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
import { LiveBadge } from "@/components/live-badge";
import { KpiStrip } from "@/components/metric-card";
import { StageTiles } from "@/components/charts/stage-tiles";
import { DATA } from "@/components/charts/palette";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import { formatMoney } from "@/lib/i18n/format";
import { computeQuotaAttainment, isQuotaActive } from "@/lib/quotas";

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
  const { data: quotasResult } = useQuotas();
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));

  const today = new Date();
  const forecast = computeForecast(opportunities, today, locale);
  const trends = computeMonthlyTrends(opportunities, today, 6, locale);
  const withAmount = opportunities.some((o) => o.amount !== null);
  const hasClosedHistory = trends.some((t) => t.won + t.lost > 0);
  const hasHistoricalRates = forecast.scoreBucketStats.length > 0;

  // Meta activa del equipo (mensual, en la divisa del equipo) — el anillo
  // del tile "Ganado" mide contra ella; sin meta, el tile muestra la ayuda.
  const teamQuota = (quotasResult?.data ?? []).find((q) => q.team_id && isQuotaActive(q, today));
  const currency = (teamsData ?? [])[0]?.currency ?? "USD";
  const goalAttainment = teamQuota ? computeQuotaAttainment(teamQuota, users ?? [], opportunities) : undefined;

  const STAGE_COLOR = { detected: DATA.indigo, ready_to_action: DATA.violet, in_progress: DATA.magenta } as const;
  const byStage = (["detected", "ready_to_action", "in_progress"] as const).map((status) => {
    const rows = opportunities.filter((o) => o.status === status);
    return {
      label: t(`forecast.byStage.${status}`),
      value: `${formatCurrencyUSD(rows.reduce((s, o) => s + (o.amount ?? 0), 0), locale)} · ${rows.length}`,
      color: STAGE_COLOR[status],
    };
  });

  return (
    <div>
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="bee-display">{t("forecast.title")}</h1>
            <p className="bee-caption mt-1">{t("forecast.subtitle")}</p>
          </div>
          <LiveBadge live={live} />
        </div>
      </header>

      <MergedPageTabs
        defaultValue="forecast"
        tabs={[
          {
            value: "forecast",
            label: t("forecast.tabs.overview"),
            content: isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
                <Skeleton className="h-56" />
              </div>
            ) : !withAmount ? (
              <div className="bee-bento bee-bento-pad py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("forecast.emptyState.title")}</p>
                <p className="bee-caption mt-1">{t("forecast.emptyState.subtitle")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Misma tarjeta compacta que Dark Funnel — antes era
                 * MetricCard (ícono + número + línea de ayuda), sin columna
                 * base para móvil. El ícono y el hint de cada KPI se van de
                 * esta fila puntual; el resto de la página no cambia. */}
                <KpiStrip
                  cols={4}
                  items={[
                    { label: t("forecast.kpis.pipeline.label"), value: formatCurrencyUSD(forecast.pipelineValue, locale), hint: t("forecast.kpis.pipeline.hint", { count: forecast.openCount }), trend: forecast.byMonth.map((b) => b.total) },
                    { label: t("forecast.kpis.weighted.label"), value: formatCurrencyUSD(forecast.weightedForecast, locale), hint: hasHistoricalRates ? t("forecast.kpis.weighted.hintHistorical") : t("forecast.kpis.weighted.hintDefault"), trend: forecast.byMonth.map((b) => b.weighted) },
                    {
                      label: t("forecast.kpis.won.label"),
                      value: formatCurrencyUSD(forecast.wonValue, locale),
                      hint: teamQuota ? t("forecast.kpis.won.goalHint", { goal: formatMoney(teamQuota.target_amount, currency, locale, true) }) : t("forecast.kpis.won.hint"),
                      progress: goalAttainment,
                      tone: "blue",
                    },
                    {
                      label: t("forecast.kpis.atRisk.label"),
                      value: forecast.atRisk.length,
                      hint: t("forecast.kpis.atRisk.hint"),
                      tone: forecast.atRisk.length > 0 ? "warm" : "default",
                    },
                  ]}
                />

                <section className="bee-surface bee-bento-pad">
                  <h3 className="bee-card-title">{t("forecast.byStage.title")}</h3>
                  <p className="bee-caption mb-4">{t("forecast.byStage.caption")}</p>
                  <StageTiles tiles={byStage} />
                </section>

                <section className="bee-surface bee-bento-pad">
                  <h3 className="bee-card-title">{t("forecast.byMonth.title")}</h3>
                  <p className="bee-caption mb-4">{t("forecast.byMonth.caption")}</p>
                  <ForecastBarChart buckets={forecast.byMonth} />
                </section>

                {/* Moved here from Resumen — "what if we prospect more" is a
                    forecasting question, and Resumen is now a summary only. */}
                <RevenueSimulatorWidget />

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
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                      {forecast.scoreBucketStats.map((s) => (
                        <div key={s.bucketStart} className="bee-bento p-4 text-center">
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
                    <ul className="space-y-2">
                      {forecast.atRisk.map(({ opportunity, reason }) => {
                        const company = opportunity.company_id
                          ? companyById.get(opportunity.company_id)
                          : undefined;
                        return (
                          <li key={opportunity.id}>
                            <button
                              type="button"
                              onClick={() => openOpportunity(opportunity.id)}
                              className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-md)] px-3 py-3 text-left transition-colors hover:bg-[var(--color-primary)]/30"
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
                              <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-chart-1)]/20 px-2 py-1 text-micro font-medium text-[var(--color-chart-1)]">
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
