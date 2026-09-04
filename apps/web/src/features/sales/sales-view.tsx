"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AreaChart } from "@/components/charts/area-chart";
import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { SALES } from "@/components/charts/palette";
import { RangePills, useTimeRange } from "@/components/charts/range-pills";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamGoalRanking } from "@/features/dashboard/team-goal-ranking";
import { ClosedLedger } from "@/features/sales/closed-ledger";
import { SectorBars } from "@/features/sales/sector-bars";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { formatAmount, formatMoney } from "@/lib/i18n/format";
import { buildSalesModel } from "@/lib/sales-model";


/**
 * Ventas — every closed deal since the organization exists. The one page
 * where the green family lives (#52C871 won · #9CD147 lime · #B4E8C5 mint):
 * cumulative revenue, monthly bars against the team goal, then where the
 * money came from (sectors) beside who closed it (the ranking), and at the
 * bottom, on its own full row, the filterable ledger of every won deal.
 */
export function SalesView() {
  const t = useTranslations("sales");
  const locale = useLocale() as Locale;
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 2200);
  const { data: users } = useUsers();
  const { data: teamsData } = useTeams();
  const { data: quotasResult } = useQuotas();
  const { data: companiesResult } = useCompanies(300);
  const [now] = useState(() => Date.now());
  // One window for the whole page: a year by default, two or five on demand.
  const { range, months, setRange } = useTimeRange();

  const model = useMemo(
    () =>
      buildSalesModel({
        opportunities: oppsResult?.data ?? [],
        teams: teamsData ?? [],
        quotas: quotasResult?.data ?? [],
        companies: companiesResult?.data ?? [],
        users: users ?? [],
        locale,
        now,
        months,
      }),
    [oppsResult, teamsData, quotasResult, companiesResult, users, locale, now, months],
  );

  const money = (v: number, compact = true) => formatMoney(v, model.currency, locale, compact);
  // KPI tiles carry the number alone: the team's currency lives in settings.
  const amount = (v: number) => formatAmount(v, locale);
  const live = oppsResult?.live ?? false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RangePills value={range} onChange={setRange} />
          <LiveBadge live={live} />
        </div>
      </header>

      <StatStrip cols={4}>
        <StatTile label={t("kpis.total")} value={amount(model.total)} hint={t("kpis.since", { count: model.won.length })} trend={model.months.map((m) => m.value)} tone={SALES.won} formatValue={(v) => money(v)} />
        <StatTile label={t("kpis.month")} value={amount(model.thisMonth.value)} delta={model.monthDelta} deltaLabel={t("kpis.vsLastMonth")} salesTone tone={SALES.won} trend={model.months.slice(-8).map((m) => m.value)} formatValue={(v) => money(v)} />
        <StatTile label={t("kpis.clients")} value={model.thisMonth.count} delta={model.clientsDelta} deltaLabel={t("kpis.vsLastMonth")} salesTone tone={SALES.lime} trend={model.months.slice(-8).map((m) => m.count)} formatValue={(v) => String(Math.round(v))} />
        {model.goal ? (
          <StatTile label={t("kpis.goal")} value={`${Math.round((model.attainment ?? 0) * 100)}%`} hint={t("kpis.goalOf", { goal: amount(model.goal) })} progress={model.attainment ?? 0} tone={(model.attainment ?? 0) >= 1 ? SALES.won : SALES.lime} />
        ) : (
          <StatTile label={t("kpis.ticket")} value={amount(model.avgTicket)} hint={model.avgCycle === null ? t("kpis.noCycle") : t("kpis.cycle", { days: Math.round(model.avgCycle) })} tone={SALES.mint} />
        )}
      </StatStrip>

      <div className="bee-overview">
        <OverviewCard span={8} title={t("cumulative.title")} caption={t("cumulative.captionRange", { months })}>
          <AreaChart points={model.cumulative} color={SALES.won} minHeight={200} formatValue={(v) => money(v)} />
        </OverviewCard>
        <OverviewCard span={4} title={t("monthly.title")} caption={model.goal ? t("monthly.captionGoalRange", { months, goal: amount(model.goal) }) : t("monthly.captionRange", { months })}>
          <BarsVsTarget
            points={model.months}
            target={model.goal}
            minHeight={200}
            formatValue={(v) => money(v)}
            // Same reading as the Ventas box on Resumen: three greens by strength.
            colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
          />
        </OverviewCard>

        <OverviewCard span={8} title={t("sectors.title")} caption={t("sectors.caption", { months })}>
          <SectorBars sectors={model.sectors} />
        </OverviewCard>
        <OverviewCard span={4} title={t("ranking.title")} caption={t("ranking.caption")}>
          <TeamGoalRanking days={90} bars />
        </OverviewCard>

        <OverviewCard span={12} title={t("ledger.title")} caption={t("ledger.caption", { count: model.won.length })}>
          <ClosedLedger rows={model.ledger} money={money} />
        </OverviewCard>
      </div>
    </div>
  );
}
