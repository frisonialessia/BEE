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
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalHexMap } from "@/features/control/components/SignalHexMap";
import { CriticalAccountsDigest } from "@/features/dashboard/critical-accounts-digest";
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
  const tCritical = useTranslations("dashboardOverview.criticalAccounts");
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
  const battlecards = battlecardsResult?.data ?? [];
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  // Incluye opps/users: sin esto, el Leaderboard alcanza a renderizar su
  // "todavía no hay ganadas" antes de que esas dos queries respondan —
  // un vacío que parece confirmado sin serlo.
  const loading = signalsLoading || battlecardsLoading || oppsLoading || usersLoading;


  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignals = signals.filter((s) => s.score >= 75).length;
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const hotLeads = battlecards.filter((b) => b.hot_lead).length;

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
      <header className="bee-topbar -mx-5 -mt-4 mb-4 px-5 pt-4">
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

      {/* Stat tiles with an 8-week trend each — number, delta and shape,
          never a bare figure. */}
      <div className="mb-4">
        <StatStrip cols={4}>
          <StatTile label={t("kpis.signals")} value={signals.length} delta={weekDelta((w) => w.count)} deltaLabel={t("kpis.weeklySignals")} trend={weekly.map((w) => w.count)} tone={DATA.indigo} />
          <StatTile label={t("kpis.hotSignals")} value={hotSignals} delta={weekDelta((w) => w.hot)} trend={weekly.map((w) => w.hot)} tone={DATA.honey} />
          <StatTile label={t("kpis.ready")} value={readyCount} hint={t("kpis.hotLeads") + ` · ${hotLeads}`} tone={DATA.violet} progress={battlecards.length ? readyCount / battlecards.length : 0} />
          <StatTile label={t("kpis.avgScore")} value={avgScore} delta={weekDelta((w) => w.avg)} trend={weekly.map((w) => w.avg)} tone={DATA.magenta} formatValue={(v) => String(Math.round(v))} />
        </StatStrip>
      </div>

      <GettingStartedCard
        signalCount={signals.length}
        opportunityCount={allOppsResult?.data.length ?? 0}
        userCount={usersResult?.length ?? 0}
      />

      {/* One shell (OverviewCard), rows paired by natural height so nothing
          has to stretch: three charts of the same aspect on top, the hive
          full width, then four columns of "today", then calendar, ranking
          and the close-rate map. What used to
          sit below this grid (battlecards, revenue simulator, every
          signal) lives on its own page — Estrategias, Pronóstico, Señales —
          so this stays a summary, not the whole product on one screen. */}
      <div className="bee-overview">
        {/* Row 1 — three charts, same height, same aspect. Ventas is the one
            green box on this page: closed revenue, the Ventas page's colors. */}
        <OverviewCard span={4} title={t("sections.signalsWeekly.title")} caption={t("sections.signalsWeekly.caption")}>
          <AreaChart points={weekly.map((w) => ({ label: w.label, value: w.count }))} color={DATA.indigo} />
        </OverviewCard>

        <OverviewCard
          span={4}
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
              // The three greens by strength: the best months in won green,
              // the middle in lime, the rest in mint — one family, one box.
              colorFor={(p, _i, max) => (p.value >= max * 0.66 ? SALES.won : p.value >= max * 0.33 ? SALES.lime : SALES.mint)}
            />
          )}
        </OverviewCard>

        <OverviewCard span={4} title={t("sections.signalMix.title")} caption={t("sections.signalMix.caption")}>
          <Donut slices={mix} otherLabel={locale === "es" ? "Otras" : "Other"} />
        </OverviewCard>

        {/* Row 2 — the hive, full width. */}
        <SignalHexMap height={240} className="h-full" style={{ gridColumn: "span 12" }} />

        {/* Row 3 — four columns of "today": the brief, the five plays, the
            funnel stacked over the critical accounts (the funnel is always
            four stages, so it gets exactly the height it needs and the
            accounts take the rest), and when the market shows up. */}
        <OverviewCard span={3} title={tBrief("title")} caption={t("sections.brief.caption")}>
          <DailyBrief embedded />
        </OverviewCard>

        <OverviewCard span={3} title={tFeed("title")} caption={tFeed("eyebrow")}>
          <DecisionFeed embedded />
        </OverviewCard>

        <div className="grid min-w-0 grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4" style={{ gridColumn: "span 3" }}>
          <OverviewCard span={12} className="!h-auto" title={t("sections.funnel.title")} caption={t("sections.funnel.caption")}>
            <PipelineFunnel opportunities={allOppsResult?.data ?? []} />
          </OverviewCard>
          <OverviewCard span={12} title={tCritical("title")} caption={t("sections.critical.caption")}>
            <CriticalAccountsDigest battlecards={battlecards} today={new Date()} embedded />
          </OverviewCard>
        </div>

        <OverviewCard span={3} title={t("sections.activityHeatmap.title")} caption={t("sections.activityHeatmap.caption")}>
          <SignalActivityHeatmap signals={signals} />
        </OverviewCard>

        {/* Row 4 — people and patterns: calendar, ranking, where you win. */}
        <OverviewCard
          span={3}
          title={tCalendar("widget.title")}
          action={
            <Link href={`${base}/calendar`} className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
              {tCalendar("widget.viewAll")}
            </Link>
          }
        >
          <MyCalendarWidget embedded />
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
          <TeamGoalRanking days={90} />
        </OverviewCard>

        <OverviewCard span={5} title={t("sections.industryHeatmap.title")} caption={t("sections.industryHeatmap.caption")}>
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
