"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type CSSProperties } from "react";

import { AreaChart } from "@/components/charts/area-chart";
import { TONE, tint } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AtRiskList } from "@/features/forecast/at-risk-list";
import { WinLossView } from "@/features/win-loss/win-loss-view";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { closeProbability, computeForecast } from "@/lib/forecast";
import { formatAmount, formatCurrencyUSD } from "@/lib/i18n/format";
import { computeQuotaActual, computeQuotaAttainment, isQuotaActive } from "@/lib/quotas";
import { CLOSED_OPPORTUNITY_STATUSES } from "@/types/domain";

/** "Si prospecto ×N" — the one lever of the projection box. Same close
 *  rate the forecast already uses (historical by score range, or by stage),
 *  applied to N× today's open pipeline. Not a model: a multiplication the
 *  reader can check. */
const PROSPECTING_FACTORS = [1, 1.5, 2] as const;
type ProspectingFactor = (typeof PROSPECTING_FACTORS)[number];

/** The three scenarios, in the order of the rows: each one a strength of
 *  the projection's indigo — conservative the softest, optimistic full. */
const SCENARIO_LEVELS = [45, 70, 100] as const;

/** Pronóstico — two tabs on one strip of four KPIs (quarter forecast,
 *  open pipeline, won against goal, at risk):
 *    Proyección      · the cumulative curve with the ×N lever, the three
 *                      scenarios as rows, the deals at risk;
 *    Ganado / perdido · won vs lost by month, loss reasons, competitors.
 *  Same financial engine, two angles on the same pipeline.
 *  /dashboard/win-loss still resolves here via redirect to ?tab=winloss.
 *
 *  Nothing is fetched from a simulation endpoint: every figure is a count
 *  over rows this page already has. The two former simulators are the one
 *  ×1 / ×1.5 / ×2 control on the projection box. */
export function ForecastView() {
  const locale = useLocale() as Locale;
  const t = useTranslations("forecastWinLoss");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 2200);
  const { data: companiesResult } = useCompanies(200);
  const { data: quotasResult } = useQuotas();
  const { data: users } = useUsers();
  const [factor, setFactor] = useState<ProspectingFactor>(1);
  // Fixed at mount so the memos below key on a stable date, like Ventas.
  const [today] = useState(() => new Date());

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const live = oppsResult?.live ?? false;
  const companyById = useMemo(() => new Map((companiesResult?.data ?? []).map((c) => [c.id, c])), [companiesResult]);

  const forecast = useMemo(() => computeForecast(opportunities, today, locale), [opportunities, today, locale]);
  const withAmount = opportunities.some((o) => o.amount !== null);
  const hasHistoricalRates = forecast.scoreBucketStats.length > 0;

  // The calendar quarter we are in: the weighted forecast of the deals
  // expected to close before it ends. The sparkline behind it is the six
  // months ahead ("Sin fecha" is not a month, so it stays out).
  const quarter = useMemo(() => {
    const q = Math.floor(today.getMonth() / 3);
    const year = today.getFullYear();
    const keys = new Set(Array.from({ length: 3 }, (_, i) => `${year}-${String(q * 3 + i + 1).padStart(2, "0")}`));
    const months = forecast.byMonth.filter((b) => b.key !== "sin_fecha");
    return {
      label: `Q${q + 1} ${year}`,
      weighted: months.filter((b) => keys.has(b.key)).reduce((sum, b) => sum + b.weighted, 0),
      trend: months.map((b) => b.weighted),
    };
  }, [forecast, today]);

  // Meta activa del equipo (mensual, en la divisa del equipo) — el anillo
  // del tile "Ganado" mide contra ella; sin meta, el tile muestra la ayuda.
  const teamQuota = (quotasResult?.data ?? []).find((q) => q.team_id && isQuotaActive(q, today));
  const wonThisPeriod = teamQuota ? computeQuotaActual(teamQuota, users ?? [], opportunities) : forecast.wonValue;
  const goalAttainment = teamQuota ? computeQuotaAttainment(teamQuota, users ?? [], opportunities) : undefined;

  const atRiskAmount = useMemo(() => forecast.atRisk.reduce((sum, r) => sum + (r.opportunity.amount ?? 0), 0), [forecast]);

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
  // KPI tiles carry the number alone: the team's currency lives in settings.
  const amount = (v: number) => formatAmount(v, locale);

  const scenarioRows = [
    { key: "conservative", value: scenarios.conservative, hint: t("forecast.projection.scenarios.conservativeHint", { count: forecast.atRisk.length }) },
    { key: "realistic", value: scenarios.realistic, hint: t("forecast.projection.scenarios.realisticHint") },
    { key: "optimistic", value: scenarios.optimistic, hint: t("forecast.projection.scenarios.optimisticHint") },
  ] as const;
  const scenarioMax = Math.max(1, ...scenarioRows.map((s) => s.value));

  const strip = isLoading ? (
    <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
      ))}
    </div>
  ) : (
    <StatStrip cols={4}>
      <StatTile
        label={t("forecast.kpis.quarter.label")}
        value={amount(quarter.weighted)}
        hint={hasHistoricalRates ? t("forecast.kpis.quarter.hintHistorical", { quarter: quarter.label }) : t("forecast.kpis.quarter.hintDefault", { quarter: quarter.label })}
        trend={quarter.trend}
        tone={TONE.forecast}
        formatValue={money}
      />
      <StatTile label={t("forecast.kpis.pipeline.label")} value={amount(forecast.pipelineValue)} hint={t("forecast.kpis.pipeline.hint", { count: forecast.openCount })} tone={TONE.prepared} />
      <StatTile
        label={t("forecast.kpis.won.label")}
        value={amount(wonThisPeriod)}
        hint={teamQuota ? t("forecast.kpis.won.goalHint", { goal: amount(teamQuota.target_amount) }) : t("forecast.kpis.won.hint")}
        progress={goalAttainment}
        tone={TONE.market}
      />
      <StatTile label={t("forecast.kpis.atRisk.label")} value={forecast.atRisk.length} hint={t("forecast.kpis.atRisk.hint", { amount: amount(atRiskAmount) })} tone={TONE.urgency} />
    </StatStrip>
  );

  return (
    <MergedPageTabs
      header={
        <header>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1">{t("forecast.title")}</h1>
          <p className="bee-caption mt-1">{t("forecast.subtitle")}</p>
        </header>
      }
      actions={<LiveBadge live={live} />}
      belowTabs={strip}
      defaultValue="forecast"
      tabs={[
        {
          value: "forecast",
          label: t("forecast.tabs.projection"),
          content: isLoading ? (
            <Skeleton className="h-96 rounded-[var(--radius-lg)]" />
          ) : !withAmount ? (
            <p className="bee-caption py-8 text-center">{t("forecast.emptyState.title")}</p>
          ) : (
            <div className="space-y-6">
              <div className="bee-overview">
                {/* The projection box: one curve, one hue, one lever. The
                    ×N pills live in the card head and take lavender when
                    pressed — a view control, never the CTA blue. */}
                <OverviewCard
                  span={8}
                  title={t("forecast.projection.title")}
                  caption={factor === 1 ? (hasHistoricalRates ? t("forecast.projection.captionHistorical") : t("forecast.projection.caption")) : t("forecast.projection.captionFactor", { factor })}
                  className="lg:min-h-[22rem]!"
                  action={
                    <div className="flex items-center gap-1.5" role="group" aria-label={t("forecast.projection.lever")}>
                      <span className="bee-caption mr-1 hidden whitespace-nowrap sm:inline">{t("forecast.projection.lever")}</span>
                      {PROSPECTING_FACTORS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          aria-pressed={f === factor}
                          onClick={() => setFactor(f)}
                          className="bee-btn-ghost bee-drawer-pill text-xs"
                          style={{ "--bee-pill-fill": TONE.calm, minWidth: 0, paddingInline: "0.625rem" } as CSSProperties}
                        >
                          {t("forecast.projection.factor", { factor: f })}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <AreaChart points={projection} color={TONE.forecast} minHeight={180} formatValue={money} highlightLast={false} />
                </OverviewCard>

                {/* Three scenarios as rows: label and assumption, a bar in
                    the projection's indigo at 45 / 70 / 100, the amount. */}
                <OverviewCard span={4} title={t("forecast.projection.scenariosTitle")} caption={t("forecast.projection.scenariosCaption")} className="lg:min-h-[22rem]!">
                  <ul className="bee-fill flex flex-col justify-around">
                    {scenarioRows.map((s, i) => (
                      <li key={s.key} className="bee-row flex-col items-stretch! gap-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{t(`forecast.projection.scenarios.${s.key}`)}</span>
                            <span className="block truncate bee-caption">{s.hint}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{money(s.value * factor)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-background)" }}>
                          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(4, (s.value / scenarioMax) * 100)}%`, background: tint(TONE.forecast, SCENARIO_LEVELS[i]) }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </OverviewCard>
              </div>

              {/* Deals en riesgo — a list, so its box is as tall as its rows
                  (own grid with auto rows: a 12-wide list must not reserve
                  the 18rem floor when it holds two rows). */}
              <div className="bee-overview" style={{ gridAutoRows: "auto" }}>
                <AtRiskList rows={forecast.atRisk} companyById={companyById} money={money} />
              </div>
            </div>
          ),
        },
        {
          value: "winloss",
          label: t("forecast.outerTabs.winLoss"),
          content: <WinLossView />,
        },
      ]}
    />
  );
}
