"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AreaChart } from "@/components/charts/area-chart";
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
import { closeProbability, computeForecast, qualificationScore } from "@/lib/forecast";
import { CLOSED_OPPORTUNITY_STATUSES } from "@/types/domain";
import { computeMonthlyTrends } from "@/lib/trends";
import { LiveBadge } from "@/components/live-badge";
import { DATA, mix } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import { formatMoney } from "@/lib/i18n/format";
import { computeQuotaAttainment, isQuotaActive } from "@/lib/quotas";

/** "Si prospecto ×N" — the one lever of the projection box. Same close
 *  rate the forecast already uses (historical by score range, or by stage),
 *  applied to N× today's open pipeline. Not a model: a multiplication the
 *  reader can check. */
const PROSPECTING_FACTORS = [1, 1.5, 2] as const;
type ProspectingFactor = (typeof PROSPECTING_FACTORS)[number];

/** Pronóstico de ingresos — pipeline ponderado por probabilidad de cierre,
 *  deals en riesgo y Ganado/Perdido: mismo motor financiero, dos ángulos
 *  sobre el mismo pipeline, en una sola fila de pestañas (antes tres filas
 *  del sidebar — ver lib/nav-items.ts). /dashboard/win-loss sigue
 *  resolviendo acá vía redirect a ?tab=winloss.
 *
 *  The two former simulators (the revenue-simulator widget and the
 *  scenario-simulator tab) both answered "what if we prospected more" with
 *  the same historical close rate the projection already uses — so they are
 *  now one control on the projection box (×1 / ×1.5 / ×2) that redraws the
 *  curve and the three scenario tiles from the loaded opportunities. Nothing
 *  is fetched from a simulation endpoint any more; every figure is a count
 *  over rows this page already has. */
export function ForecastView() {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 200);
  const { data: companiesResult } = useCompanies(200);
  const { data: quotasResult } = useQuotas();
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();
  const [factor, setFactor] = useState<ProspectingFactor>(1);
  // Fixed at mount so the memos below key on a stable date, like Ventas.
  const [today] = useState(() => new Date());

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const live = oppsResult?.live ?? false;
  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));

  const forecast = useMemo(() => computeForecast(opportunities, today, locale), [opportunities, today, locale]);
  const trends = useMemo(() => computeMonthlyTrends(opportunities, today, 6, locale), [opportunities, today, locale]);
  const withAmount = opportunities.some((o) => o.amount !== null);
  const hasClosedHistory = trends.some((t) => t.won + t.lost > 0);
  const hasHistoricalRates = forecast.scoreBucketStats.length > 0;

  // Meta activa del equipo (mensual, en la divisa del equipo) — el anillo
  // del tile "Ganado" mide contra ella; sin meta, el tile muestra la ayuda.
  const teamQuota = (quotasResult?.data ?? []).find((q) => q.team_id && isQuotaActive(q, today));
  const currency = (teamsData ?? [])[0]?.currency ?? "USD";
  const goalAttainment = teamQuota ? computeQuotaAttainment(teamQuota, users ?? [], opportunities) : undefined;

  // Three scenarios, three real assumptions over the same open deals:
  //   conservative — the at-risk deals (no date, overdue, under-qualified)
  //                  don't close: weighted forecast without them;
  //   realistic    — the forecast itself: amount × close probability;
  //   optimistic   — everything already in progress closes in full.
  // The ×N lever multiplies all three: N× the pipeline at the same rate.
  const scenarios = useMemo(() => {
    const atRiskIds = new Set(forecast.atRisk.map((r) => r.opportunity.id));
    const open = opportunities.filter((o) => !CLOSED_OPPORTUNITY_STATUSES.includes(o.status));
    let conservative = 0;
    let optimistic = 0;
    for (const o of open) {
      const amount = o.amount ?? 0;
      const p = closeProbability(o, forecast.scoreBucketStats);
      const weighted = amount * p;
      if (!atRiskIds.has(o.id)) conservative += weighted;
      optimistic += o.status === "in_progress" ? amount : weighted;
    }
    return { conservative, realistic: forecast.weightedForecast, optimistic };
  }, [opportunities, forecast]);

  // Cumulative weighted forecast month over month — the curve. "Sin fecha"
  // is not a month, so it stays out of the curve (it is in the tiles).
  const projection = useMemo(() => {
    const points: { label: string; value: number }[] = [];
    for (const b of forecast.byMonth) {
      if (b.key === "sin_fecha") continue;
      const previous = points.length > 0 ? points[points.length - 1].value : 0;
      points.push({ label: b.label, value: previous + b.weighted * factor });
    }
    return points;
  }, [forecast, factor]);

  const money = (v: number) => formatCurrencyUSD(v, locale);

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
                    Ventas and Resumen: open, weighted, won against goal, at
                    risk. The stage split is the CRM's job. */}
                <StatStrip cols={4}>
                  <StatTile
                    label={t("forecast.kpis.pipeline.label")}
                    value={money(forecast.pipelineValue)}
                    hint={t("forecast.kpis.pipeline.hint", { count: forecast.openCount })}
                    trend={forecast.byMonth.map((b) => b.total)}
                    tone={DATA.indigo}
                    formatValue={money}
                  />
                  <StatTile
                    label={t("forecast.kpis.weighted.label")}
                    value={money(forecast.weightedForecast)}
                    hint={hasHistoricalRates ? t("forecast.kpis.weighted.hintHistorical") : t("forecast.kpis.weighted.hintDefault")}
                    trend={forecast.byMonth.map((b) => b.weighted)}
                    tone={DATA.honey}
                    formatValue={money}
                  />
                  <StatTile
                    label={t("forecast.kpis.won.label")}
                    value={money(forecast.wonValue)}
                    hint={teamQuota ? t("forecast.kpis.won.goalHint", { goal: formatMoney(teamQuota.target_amount, currency, locale, true) }) : t("forecast.kpis.won.hint")}
                    progress={goalAttainment}
                    // Won at full honey: green belongs to Ventas and the CRM board only.
                    tone={DATA.honey}
                  />
                  <StatTile
                    label={t("forecast.kpis.atRisk.label")}
                    value={forecast.atRisk.length}
                    hint={t("forecast.kpis.atRisk.hint")}
                    tone={forecast.atRisk.length > 0 ? DATA.honey : DATA.muted}
                  />
                </StatStrip>

                <div className="bee-overview">
                  {/* The projection box: one curve, one hue, one lever. The
                      segmented ×N control lives in the card head and wears
                      the box's indigo, not the CTA color — it is a view
                      control, not an action. */}
                  <OverviewCard
                    span={8}
                    title={t("forecast.projection.title")}
                    caption={factor === 1 ? t("forecast.projection.caption") : t("forecast.projection.captionFactor", { factor })}
                    action={
                      <div className="flex items-center gap-2">
                        <span className="bee-micro hidden whitespace-nowrap sm:inline">{t("forecast.projection.lever")}</span>
                        <div className="bee-filter-tabs" role="group" aria-label={t("forecast.projection.lever")}>
                          {PROSPECTING_FACTORS.map((f) => {
                            const active = f === factor;
                            return (
                              <button
                                key={f}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setFactor(f)}
                                className="bee-filter-tab"
                                style={active ? { background: mix(DATA.indigo, 24), borderColor: DATA.indigo, color: "var(--color-text)" } : undefined}
                              >
                                {t("forecast.projection.factor", { factor: f })}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    }
                  >
                    <AreaChart points={projection} color={DATA.indigo} minHeight={160} formatValue={money} highlightLast={false} />
                    <dl className="mt-3 grid grid-cols-3 gap-2">
                      {(
                        [
                          { key: "conservative", value: scenarios.conservative, hint: t("forecast.projection.scenarios.conservativeHint", { count: forecast.atRisk.length }) },
                          { key: "realistic", value: scenarios.realistic, hint: t("forecast.projection.scenarios.realisticHint") },
                          { key: "optimistic", value: scenarios.optimistic, hint: t("forecast.projection.scenarios.optimisticHint") },
                        ] as const
                      ).map((s) => (
                        <div key={s.key} className="min-w-0 rounded-[var(--radius-md)] px-3 py-2" style={{ background: mix(DATA.indigo, s.key === "realistic" ? 18 : 10) }}>
                          <dt className="bee-micro truncate">{t(`forecast.projection.scenarios.${s.key}`)}</dt>
                          <dd className="text-sm font-bold tabular-nums [overflow-wrap:anywhere]">{money(s.value * factor)}</dd>
                          <dd className="bee-micro truncate" title={s.hint}>{s.hint}</dd>
                        </div>
                      ))}
                    </dl>
                  </OverviewCard>

                  <OverviewCard span={4} title={t("forecast.atRiskSection.title")} caption={t("forecast.atRiskSection.caption")}>
                    {forecast.atRisk.length === 0 ? (
                      <p className="bee-caption py-8 text-center">{t("forecast.atRiskSection.empty")}</p>
                    ) : (
                      <ul className="bee-fill flex max-h-[22rem] flex-col justify-evenly gap-1 overflow-y-auto">
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
                      <div className="bee-fill grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              </div>
            ),
          },
          {
            value: "winloss",
            label: t("forecast.outerTabs.winLoss"),
            content: <WinLossView showHeader={false} />,
          },
        ]}
      />
    </div>
  );
}
