"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AreaChart } from "@/components/charts/area-chart";
import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { Donut } from "@/components/charts/donut";
import { DATA, SALES } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalHexMap } from "@/features/control/components/SignalHexMap";
import { DailyBrief } from "@/features/dashboard/daily-brief";
import { DecisionFeed } from "@/features/dashboard/decision-feed";
import { GettingStartedCard } from "@/features/dashboard/getting-started-card";
import { MyCalendarWidget } from "@/features/calendar/my-calendar-widget";
import { TeamGoalRanking } from "@/features/dashboard/team-goal-ranking";
import { getSignalTypeLabels } from "@/lib/format";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { useMemo, useState } from "react";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useDashboardBase } from "@/lib/demo/mode";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import { formatMoney } from "@/lib/i18n/format";
import { buildSalesModel } from "@/lib/sales-model";
import { LiveBadge } from "@/components/live-badge";

/**
 * Resumen — the analytics tool: KPI strip, enriched battlecards, and the
 * live signal feed. The operational panels (brand, network, dark funnel,
 * sequences, resilience) each have their own dedicated route — see the
 * rail nav — so this page stays a focused overview rather than a
 * kitchen-sink dashboard.
 */
export function DashboardOverview({
  headerAction,
}: {
  /** Extra control rendered next to the status badge, when a host page needs one. */
  headerAction?: React.ReactNode;
} = {}) {
  const t = useTranslations("dashboardOverview.overview");
  const locale = useLocale() as Locale;
  const [now] = useState(() => Date.now());
  const tFeed = useTranslations("dashboardOverview.decisionFeed");
  const tBrief = useTranslations("dashboardOverview.dailyBrief");
  const tCalendar = useTranslations("calendar");
  const base = useDashboardBase();
  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();
  const { data: allOppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 200);
  const { data: usersResult, isLoading: usersLoading } = useUsers();
  const { data: companiesResult } = useCompanies(200);
  const { data: teamsData } = useTeams();
  const { data: quotasResult } = useQuotas();

  const signals = useMemo(() => signalsResult?.data ?? [], [signalsResult]);
  const battlecards = useMemo(() => battlecardsResult?.data ?? [], [battlecardsResult]);
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  // Incluye opps/users: sin esto, el Leaderboard alcanza a renderizar su
  // "todavía no hay ganadas" antes de que esas dos queries respondan —
  // un vacío que parece confirmado sin serlo.
  const loading = signalsLoading || battlecardsLoading || oppsLoading || usersLoading;


  const hotSignals = signals.filter((s) => s.score >= 75).length;

  // Weekly series (8 weeks) behind the tiles and the first chart, and the
  // 30-day mix by type for the donut — all from the signals already loaded.
  const weekly = useMemo(() => {
    const WEEK = 7 * 86_400_000;
    return Array.from({ length: 8 }, (_, i) => {
      const to = now - (7 - i) * WEEK;
      const rows = signals.filter((s) => {
        const d = new Date(s.detected_at).getTime();
        return d >= to - WEEK && d < to;
      });
      const hot = rows.filter((s) => s.score >= 75).length;
      const avg = rows.length ? rows.reduce((a, s) => a + s.score, 0) / rows.length : 0;
      const label = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short" }).format(new Date(to - WEEK));
      return { label, count: rows.length, hot, avg };
    });
  }, [signals, now, locale]);
  const mix = useMemo(() => {
    const labels = getSignalTypeLabels(locale);
    const since = now - 30 * 86_400_000;
    const counts = new Map<string, number>();
    for (const s of signals) {
      if (new Date(s.detected_at).getTime() < since) continue;
      counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, value]) => ({ label: labels[type as keyof typeof labels] ?? type, value }));
  }, [signals, now, locale]);
  // Twelve months of closed revenue against the active goal — the same model
  // the Ventas page uses, so the box and the page never disagree.
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
        months: 12,
      }),
    [allOppsResult, teamsData, quotasResult, companiesResult, usersResult, locale, now],
  );
  const money = (v: number) => formatMoney(v, sales.currency, locale, true);
  const openPipeline = useMemo(() => {
    const open = (allOppsResult?.data ?? []).filter((o) => !["won", "lost", "dismissed"].includes(o.status));
    return { count: open.length, amount: open.reduce((sum, o) => sum + (o.amount ?? 0), 0) };
  }, [allOppsResult]);
  const criticalAccounts = useMemo(() => battlecards.filter((b) => b.ready_to_action).sort((a, b) => b.score - a.score), [battlecards]);
  const weekDelta = (pick: (w: (typeof weekly)[number]) => number) => {
    const last = pick(weekly[7]);
    const prev = pick(weekly[6]);
    return prev > 0 ? (last - prev) / prev : null;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-14 ${i === 4 ? "hidden md:block" : ""}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Same header block as every other page, so the KPI strip below
          starts at the same height everywhere in BEE. */}
      <header className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge live={live} />
            {headerAction}
          </div>
        </div>

      </header>

      {/* KPIs: two about the market, two about money — the first line already
          mixes what is coming in with what is being closed. */}
      <div className="mb-4">
        <StatStrip cols={4}>
          <StatTile label={t("kpis.signals")} value={signals.length} delta={weekDelta((w) => w.count)} deltaLabel={t("kpis.weeklySignals")} trend={weekly.map((w) => w.count)} tone={DATA.indigo} />
          <StatTile label={t("kpis.hotSignals")} value={hotSignals} delta={weekDelta((w) => w.hot)} trend={weekly.map((w) => w.hot)} tone={DATA.honey} />
          <StatTile
            label={t("kpis.wonMonth")}
            value={sales.thisMonth.value}
            formatValue={(v) => money(v)}
            delta={sales.monthDelta}
            hint={sales.goal ? t("kpis.goalHint", { goal: money(sales.goal) }) : undefined}
            progress={sales.attainment ?? undefined}
            tone={SALES.won}
          />
          <StatTile
            label={t("kpis.openPipeline")}
            value={openPipeline.amount}
            formatValue={(v) => money(v)}
            hint={t("kpis.openPipelineHint", { count: openPipeline.count })}
            tone={DATA.violet}
          />
        </StatStrip>
      </div>

      <GettingStartedCard
        signalCount={signals.length}
        opportunityCount={allOppsResult?.data.length ?? 0}
        userCount={usersResult?.length ?? 0}
      />

      {/* Four rows, one question each, read top to bottom:
          Hoy      — what do I do today (plays incl. critical accounts · brief · calendar)
          Dinero   — how is the money (won by month · funnel · team)
          Mercado  — what the market sent (weekly signals with their mix, one box)
          Apuntar  — where to aim (the hive of intent · where we close best)
          Down from 13 boxes to 9 so the page tells the rep what to do instead
          of tiring them. "Cuándo llega el mercado" moved to Señales, where the
          day/hour pattern is used to plan prospecting. */}
      <div className="bee-overview">
        {/* Hoy */}
        <OverviewCard span={4} title={tFeed("title")} caption={tFeed("eyebrow")} className="lg:min-h-[32rem]!">
          <DecisionFeed embedded criticalAccounts={criticalAccounts} />
        </OverviewCard>

        <OverviewCard span={4} title={tBrief("title")} caption={t("sections.brief.caption")} className="lg:min-h-[32rem]!">
          <DailyBrief embedded />
        </OverviewCard>

        <OverviewCard
          span={4}
          className="lg:min-h-[32rem]!"
          title={tCalendar("widget.title")}
          action={
            <Link href={`${base}/calendar`} className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
              {tCalendar("widget.viewAll")}
            </Link>
          }
        >
          <MyCalendarWidget embedded />
        </OverviewCard>

        {/* Dinero */}
        <OverviewCard
          span={5}
          title={t("sections.sales.title")}
          caption={sales.goal ? t("sections.sales.captionGoal", { goal: money(sales.goal) }) : t("sections.sales.caption")}
          action={
            <Link href={`${base}/sales`} className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
              {t("sections.sales.link")}
            </Link>
          }
        >
          {sales.won.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("sections.sales.empty")}</p>
          ) : (
            <BarsVsTarget
              points={sales.months}
              target={sales.goal}
              formatValue={(v) => money(v)}
              colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
            />
          )}
        </OverviewCard>

        <OverviewCard span={3} title={t("sections.funnel.title")} caption={t("sections.funnel.caption")}>
          <PipelineFunnel opportunities={allOppsResult?.data ?? []} />
        </OverviewCard>

        <OverviewCard
          span={4}
          title={t("sections.ranking.title")}
          caption={t("sections.ranking.caption")}
          action={
            <Link href={`${base}/sales`} className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
              {t("sections.ranking.link")}
            </Link>
          }
        >
          <TeamGoalRanking days={90} limit={4} bars />
        </OverviewCard>

        {/* Mercado — one box: volume by week on the left, mix by type on the right. */}
        <OverviewCard span={12} title={t("sections.market.title")} caption={t("sections.market.caption")}>
          <div className="bee-fill grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="flex min-h-0 flex-col">
              <p className="bee-caption mb-1">{t("sections.signalsWeekly.caption")}</p>
              <div className="bee-fill min-h-[11rem]">
                <AreaChart points={weekly.map((w) => ({ label: w.label, value: w.count }))} color={DATA.indigo} />
              </div>
            </div>
            <div className="flex min-h-0 flex-col lg:border-l lg:border-border lg:pl-6">
              <p className="bee-caption mb-1">{t("sections.signalMix.caption")}</p>
              <div className="bee-fill min-h-[11rem]">
                <Donut slices={mix} otherLabel={locale === "es" ? "Otras" : "Other"} />
              </div>
            </div>
          </div>
        </OverviewCard>

        {/* Apuntar */}
        <SignalHexMap height={220} className="h-full" style={{ gridColumn: "span 6" }} />

        <OverviewCard span={6} title={t("sections.industryHeatmap.title")} caption={t("sections.industryHeatmap.caption")}>
          <IndustrySignalHeatmap
            opportunities={allOppsResult?.data ?? []}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </OverviewCard>
      </div>
    </>
  );
}
