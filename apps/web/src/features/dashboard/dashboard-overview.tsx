"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { SALES, TONE } from "@/components/charts/palette";
import { RANGE_MONTHS, RangePills, useTimeRange } from "@/components/charts/range-pills";
import { StackedBars, type StackedPoint } from "@/components/charts/stacked-bars";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { PageHeader, PageShell } from "@/components/dashboard/page-shell";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MyCalendarWidget } from "@/features/calendar/my-calendar-widget";
import { DailyBrief } from "@/features/dashboard/daily-brief";
import { DecisionFeed } from "@/features/dashboard/decision-feed";
import { GettingStartedCard } from "@/features/dashboard/getting-started-card";
import { TeamGoalRanking } from "@/features/dashboard/team-goal-ranking";
import { IntentHive, stageOf } from "@/features/signals/intent-hive";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useHiveLeads } from "@/hooks/queries/use-lead-board";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useSignals } from "@/hooks/queries/use-signals";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";
import { getSignalTypeLabels } from "@/lib/format";
import { formatAmount, formatMoney } from "@/lib/i18n/format";
import { buildSalesModel } from "@/lib/sales-model";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Resumen — nine boxes, four questions, read top to bottom:
 *   Hoy      · the hive of intent with today's plays beside it, then the
 *              brief, the calendar and the ranking;
 *   Dinero   · won by month against the goal, the funnel;
 *   Apuntar  · where we close best (industry × signal);
 *   Mercado  · 84 days of signals stacked by type.
 * The strip above mixes two market KPIs with two money KPIs. Everything
 * here is a window; each page is the detail, so no chart repeats another.
 */
export function DashboardOverview({
  headerAction,
}: {
  /** Extra control rendered next to the status badge, when a host page needs one. */
  headerAction?: React.ReactNode;
} = {}) {
  const t = useTranslations("dashboardOverview.overview");
  const tFeed = useTranslations("dashboardOverview.decisionFeed");
  const tBrief = useTranslations("dashboardOverview.dailyBrief");
  const tCalendar = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const base = useDashboardBase();
  const [now] = useState(() => Date.now());
  // Every time chart shows a year and zooms out to five; the two boxes
  // keep their own window.
  const salesRange = useTimeRange();
  const marketRange = useTimeRange();

  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();
  const { data: allOppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 200);
  const { data: usersResult, isLoading: usersLoading } = useUsers();
  const { data: companiesResult } = useCompanies(200);
  const { data: teamsData } = useTeams();
  const { data: quotasResult } = useQuotas();
  const { data: hiveResult } = useHiveLeads(200);

  const signals = useMemo(() => signalsResult?.data ?? [], [signalsResult]);
  const battlecards = useMemo(() => battlecardsResult?.data ?? [], [battlecardsResult]);
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  const loading = signalsLoading || battlecardsLoading || oppsLoading || usersLoading;

  // Eight weeks of signals behind the first tile.
  const weekly = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const to = now - (7 - i) * WEEK_MS;
        return signals.filter((s) => {
          const d = new Date(s.detected_at).getTime();
          return d >= to - WEEK_MS && d < to;
        }).length;
      }),
    [signals, now],
  );
  const weekDelta = weekly[6] > 0 ? (weekly[7] - weekly[6]) / weekly[6] : null;

  // Accounts in a buying window: ready to buy or hot, from the same leads
  // the hive draws.
  const hiveLeads = useMemo(() => hiveResult?.data ?? [], [hiveResult]);
  const buyingWindow = hiveLeads.filter((l) => stageOf(l) === "ready_to_buy" || (l.manual_temperature === null && l.is_hot)).length;
  const hotTrend = useMemo(() => {
    const byWeek = Array.from({ length: 8 }, () => 0);
    for (const l of hiveLeads) {
      const at = l.hot_since ?? l.last_signal_at ?? l.created_at;
      const age = Math.floor((now - new Date(at).getTime()) / WEEK_MS);
      if (age >= 0 && age < 8) byWeek[7 - age] += 1;
    }
    return byWeek;
  }, [hiveLeads, now]);

  // Twelve months of closed revenue against the active goal — the same
  // model the Ventas page uses, so the box and the page never disagree.
  const sales = useMemo(
    () =>
      buildSalesModel({
        opportunities: allOppsResult?.data ?? [],
        teams: teamsData ?? [],
        quotas: quotasResult?.data ?? [],
        companies: companiesResult?.data ?? [],
        users: usersResult ?? [],
        locale,
        now,
        months: salesRange.months,
      }),
    [allOppsResult, teamsData, quotasResult, companiesResult, usersResult, locale, now, salesRange.months],
  );
  const money = (v: number) => formatMoney(v, sales.currency, locale, true);
  // KPI tiles carry the number alone: the team's currency lives in settings.
  const amount = (v: number) => formatAmount(v, locale);
  const openPipeline = useMemo(() => {
    const open = (allOppsResult?.data ?? []).filter((o) => !["won", "lost", "dismissed"].includes(o.status));
    return { count: open.length, amount: open.reduce((sum, o) => sum + (o.amount ?? 0), 0) };
  }, [allOppsResult]);
  const criticalAccounts = useMemo(() => battlecards.filter((b) => b.ready_to_action).sort((a, b) => b.score - a.score), [battlecards]);

  // Mercado: signals stacked by the three most common types — one bar a
  // week over a year, one a month when zoomed out to two or five years.
  const market = useMemo(() => {
    const labels = getSignalTypeLabels(locale);
    const monthsBack = RANGE_MONTHS[marketRange.range];
    const weekly = marketRange.range === "1y";
    const since = weekly ? now - 52 * WEEK_MS : new Date(new Date(now).getFullYear(), new Date(now).getMonth() - (monthsBack - 1), 1).getTime();
    const recent = signals.filter((s) => new Date(s.detected_at).getTime() >= since);
    const counts = new Map<string, number>();
    for (const s of recent) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const fmt = new Intl.DateTimeFormat(localeTags[locale], weekly ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    const buckets: { from: number; to: number; label: string }[] = [];
    if (weekly) {
      for (let i = 51; i >= 0; i--) {
        const to = now - i * WEEK_MS;
        buckets.push({ from: to - WEEK_MS, to, label: fmt.format(new Date(to - WEEK_MS)) });
      }
    } else {
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() - i);
        const from = d.getTime();
        buckets.push({ from, to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), label: fmt.format(d) });
      }
    }
    const points: StackedPoint[] = buckets.map((b, i) => {
      const rows = recent.filter((s) => {
        const d = new Date(s.detected_at).getTime();
        return d >= b.from && d < b.to;
      });
      const parts = top.map((k) => rows.filter((s) => s.signal_type === k).length);
      parts.push(rows.filter((s) => !top.includes(s.signal_type)).length);
      return { label: b.label, parts, current: i === buckets.length - 1 };
    });
    const legend = top.map((k) => labels[k as keyof typeof labels] ?? k);
    if (points.some((p) => p.parts[p.parts.length - 1] > 0)) legend.push(t("sections.market.other"));
    return { points, legend, total: recent.length, weekly };
  }, [signals, now, locale, t, marketRange.range]);

  if (loading) {
    return (
      <PageShell header={<PageHeader eyebrow={t("eyebrow")} title={t("title")} caption={t("subtitle")} />}>
        <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
          ))}
        </div>
        <Skeleton className="mt-6 h-96 rounded-[var(--radius-lg)]" />
      </PageShell>
    );
  }

  return (
    <PageShell
      header={
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          caption={t("subtitle")}
          actions={
            <>
              <LiveBadge live={live} />
              {headerAction}
            </>
          }
        />
      }
      kpis={
        <StatStrip cols={4}>
          <StatTile label={t("kpis.signals")} value={signals.length} delta={weekDelta} deltaLabel={t("kpis.weeklySignals")} trend={weekly} tone={TONE.market} />
          <StatTile label={t("kpis.buyingWindow")} value={buyingWindow} hint={t("kpis.buyingWindowHint")} trend={hotTrend} tone={TONE.forecast} />
          <StatTile
            label={t("kpis.wonMonth")}
            value={amount(sales.thisMonth.value)}
            delta={sales.monthDelta}
            deltaLabel={sales.goal ? t("kpis.goalHint", { goal: amount(sales.goal) }) : undefined}
            progress={sales.attainment ?? undefined}
            tone={TONE.urgency}
          />
          <StatTile label={t("kpis.openPipeline")} value={amount(openPipeline.amount)} hint={t("kpis.openPipelineHint", { count: openPipeline.count })} tone={TONE.prepared} />
        </StatStrip>
      }
    >
      <GettingStartedCard signalCount={signals.length} opportunityCount={allOppsResult?.data.length ?? 0} userCount={usersResult?.length ?? 0} />

      <div className="bee-overview">
        {/* Hoy — the hive at the centre, the plays beside it. */}
        <OverviewCard span={8} title={t("sections.hive.title")} caption={t("sections.hive.caption")} className="lg:min-h-[34rem]!" action={<CardLink href={`${base}/signals?tab=intent`}>{t("sections.hive.link")}</CardLink>}>
          <IntentHive maxRadius={34} minHeight={300} maxCells={200} />
        </OverviewCard>
        <OverviewCard span={4} title={tFeed("title")} caption={tFeed("eyebrow")} className="lg:min-h-[34rem]!">
          <DecisionFeed criticalAccounts={criticalAccounts} />
        </OverviewCard>

        <OverviewCard span={4} title={tBrief("title")} caption={t("sections.brief.caption")} className="lg:min-h-[24rem]!">
          <DailyBrief />
        </OverviewCard>
        <OverviewCard span={4} title={tCalendar("widget.title")} caption={t("sections.calendar.caption")} className="lg:min-h-[24rem]!" action={<CardLink href={`${base}/calendar`}>{tCalendar("widget.viewAll")}</CardLink>}>
          <MyCalendarWidget embedded />
        </OverviewCard>
        <OverviewCard span={4} title={t("sections.ranking.title")} caption={t("sections.ranking.caption")} className="lg:min-h-[24rem]!" action={<CardLink href={`${base}/sales`}>{t("sections.ranking.link")}</CardLink>}>
          <TeamGoalRanking days={90} limit={4} bars />
        </OverviewCard>

        {/* Dinero — closed by month, the funnel; Apuntar — where we close best. */}
        <OverviewCard
          span={5}
          title={t("sections.sales.title")}
          caption={sales.goal ? t("sections.sales.captionGoal", { goal: money(sales.goal) }) : t("sections.sales.caption")}
          action={
            <span className="flex items-center gap-3">
              <RangePills value={salesRange.range} onChange={salesRange.setRange} />
              <CardLink href={`${base}/sales`}>{t("sections.sales.link")}</CardLink>
            </span>
          }
        >
          {sales.won.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("sections.sales.empty")}</p>
          ) : (
            <BarsVsTarget
              points={sales.months}
              target={sales.goal}
              formatValue={(v) => money(v)}
              // The one green box on Resumen: the three sales greens by amount,
              // exactly as the Ventas page reads them.
              colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
            />
          )}
        </OverviewCard>
        <OverviewCard span={3} title={t("sections.funnel.title")} caption={t("sections.funnel.caption")}>
          <PipelineFunnel opportunities={allOppsResult?.data ?? []} />
        </OverviewCard>
        <OverviewCard span={4} title={t("sections.industryHeatmap.title")} caption={t("sections.industryHeatmap.caption")}>
          <IndustrySignalHeatmap opportunities={allOppsResult?.data ?? []} signals={signals} companies={companiesResult?.data ?? []} />
        </OverviewCard>

        {/* Mercado — one box, 84 days of signals by type. */}
        <OverviewCard
          span={12}
          title={t("sections.market.title")}
          caption={t(market.weekly ? "sections.market.captionWeekly" : "sections.market.captionMonthly", { count: market.total })}
          className="lg:min-h-[16rem]!"
          action={
            <span className="flex items-center gap-3">
              <RangePills value={marketRange.range} onChange={marketRange.setRange} />
              <CardLink href={`${base}/signals`}>{t("sections.market.link")}</CardLink>
            </span>
          }
        >
          {market.total === 0 ? (
            <p className="bee-caption py-8 text-center">{t("sections.market.empty")}</p>
          ) : (
            <StackedBars points={market.points} legend={market.legend} tone={TONE.market} minHeight={150} />
          )}
        </OverviewCard>
      </div>
    </PageShell>
  );
}
