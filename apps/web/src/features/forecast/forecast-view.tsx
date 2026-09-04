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
import { DATA, SALES, mix } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
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

  return (
    <div>
      <MergedPageTabs
        header={
          <header>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("forecast.title")}</h1>
            <p className="bee-caption mt-1">{t("forecast.subtitle")}</p>
          </header>
        }
        actions={<LiveBadge live={live} />}
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
                {/* Four tiles, then the 12-column grid — the same shell as
                    Ventas and Resumen. The stage split that used to sit here
                    as a second "pipeline abierto" row is the CRM's job; this
                    page keeps the four numbers that answer "how much will we
                    close": open, weighted, won against goal, at risk. */}
                <StatStrip cols={4}>
                  <StatTile
                    label={t("forecast.kpis.pipeline.label")}
                    value={formatCurrencyUSD(forecast.pipelineValue, locale)}
                    hint={t("forecast.kpis.pipeline.hint", { count: forecast.openCount })}
                    trend={forecast.byMonth.map((b) => b.total)}
                    tone={DATA.indigo}
                    formatValue={(v) => formatCurrencyUSD(v, locale)}
                  />
                  <StatTile
                    label={t("forecast.kpis.weighted.label")}
                    value={formatCurrencyUSD(forecast.weightedForecast, locale)}
                    hint={hasHistoricalRates ? t("forecast.kpis.weighted.hintHistorical") : t("forecast.kpis.weighted.hintDefault")}
                    trend={forecast.byMonth.map((b) => b.weighted)}
                    tone={DATA.honey}
                    formatValue={(v) => formatCurrencyUSD(v, locale)}
                  />
                  <StatTile
                    label={t("forecast.kpis.won.label")}
                    value={formatCurrencyUSD(forecast.wonValue, locale)}
                    hint={teamQuota ? t("forecast.kpis.won.goalHint", { goal: formatMoney(teamQuota.target_amount, currency, locale, true) }) : t("forecast.kpis.won.hint")}
                    progress={goalAttainment}
                    // Won is the one green tile on this page — Ventas' reading.
                    tone={SALES.won}
                  />
                  <StatTile
                    label={t("forecast.kpis.atRisk.label")}
                    value={forecast.atRisk.length}
                    hint={t("forecast.kpis.atRisk.hint")}
                    tone={forecast.atRisk.length > 0 ? DATA.honey : DATA.muted}
                  />
                </StatStrip>

                <div className="bee-overview">
                  <OverviewCard span={8} title={t("forecast.byMonth.title")} caption={t("forecast.byMonth.caption")}>
                    <ForecastBarChart buckets={forecast.byMonth} />
                  </OverviewCard>

                  <OverviewCard span={4} title={t("forecast.atRiskSection.title")} caption={t("forecast.atRiskSection.caption")}>
                    {forecast.atRisk.length === 0 ? (
                      <p className="bee-caption py-8 text-center">{t("forecast.atRiskSection.empty")}</p>
                    ) : (
                      <ul className="flex max-h-[22rem] flex-col gap-1 overflow-y-auto">
                        {forecast.atRisk.map(({ opportunity, reason }) => {
                          const company = opportunity.company_id ? companyById.get(opportunity.company_id) : undefined;
                          return (
                            <li key={opportunity.id}>
                              <button
                                type="button"
                                onClick={() => openOpportunity(opportunity.id)}
                                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-primary)]/30"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{stripOpportunityTitlePrefix(opportunity.title)}</span>
                                  <span className="block truncate bee-micro">
                                    {company?.name ?? t("forecast.atRiskSection.noCompany")} ·{" "}
                                    {t("forecast.atRiskSection.qualifiedPercent", { percent: Math.round(qualificationScore(opportunity.qualification) * 100) })}
                                  </span>
                                </span>
                                <span className="shrink-0 rounded-full px-2 py-0.5 bee-micro font-medium text-[var(--color-text)]" style={{ background: mix(DATA.honeyFill, 30) }}>
                                  {t(`forecast.atRiskSection.riskLabels.${reason}`)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </OverviewCard>

                  {hasClosedHistory && (
                    <OverviewCard span={forecast.scoreBucketStats.length > 0 ? 6 : 12} title={t("forecast.trend.title")} caption={t("forecast.trend.caption")}>
                      <TrendsChart points={trends} />
                    </OverviewCard>
                  )}

                  {forecast.scoreBucketStats.length > 0 && (
                    <OverviewCard span={hasClosedHistory ? 6 : 12} title={t("forecast.accuracy.title")} caption={t("forecast.accuracy.caption")}>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {forecast.scoreBucketStats.map((s) => (
                          <div key={s.bucketStart} className="flex flex-col justify-center rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(DATA.indigo, 14) }}>
                            <p className="bee-micro font-medium text-[var(--color-text)]">
                              {t("forecast.accuracy.scoreLabel", { start: s.bucketStart, end: s.bucketStart + 19 })}
                            </p>
                            <p className="text-sm font-bold tabular-nums">{Math.round(s.winRate * 100)}%</p>
                            <p className="bee-micro">{t("forecast.accuracy.sampleSize", { count: s.sampleSize })}</p>
                          </div>
                        ))}
                      </div>
                    </OverviewCard>
                  )}
                </div>

                {/* Moved here from Resumen — "what if we prospect more" is a
                    forecasting question, and Resumen is now a summary only. */}
                <RevenueSimulatorWidget />
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
