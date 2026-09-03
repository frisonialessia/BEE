"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { KpiStrip } from "@/components/metric-card";
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
import { useCompanies } from "@/hooks/queries/use-companies";
import { useDashboardBase } from "@/lib/demo/mode";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
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

  const signals = signalsResult?.data ?? [];
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

        {/* Five compact KPIs in one row; "Score medio" hides on a phone so
            the row stays 2×2 — the same strip every page opens with. */}
        <KpiStrip
          cols={5}
          items={[
            { label: t("kpis.signals"), value: signals.length },
            { label: t("kpis.hotSignals"), value: hotSignals },
            { label: t("kpis.ready"), value: readyCount },
            { label: t("kpis.hotLeads"), value: hotLeads },
            { label: t("kpis.avgScore"), value: avgScore, hideOnMobile: true },
          ]}
        />
      </header>

      <GettingStartedCard
        signalCount={signals.length}
        opportunityCount={allOppsResult?.data.length ?? 0}
        userCount={usersResult?.length ?? 0}
      />

      {/* Nine boxes, three rows, one shell (OverviewCard). Every box in a
          row is the same height; the only colored fills on the page are the
          signal-tone accents inside cards, never the cards themselves. What
          used to sit below this grid (battlecards, revenue simulator, every
          signal) lives on its own page — Estrategias, Pronóstico, Señales —
          so this stays a summary, not the whole product on one screen. */}
      <div className="bee-overview">
        {/* Row 1 — what needs you now: the accounts closing today, the hive
            of live signals, and your calendar. */}
        <OverviewCard span={3} title={tCritical("title")} caption={t("sections.critical.caption")}>
          <CriticalAccountsDigest battlecards={battlecards} today={new Date()} embedded />
        </OverviewCard>

        <SignalHexMap height={240} className="h-full" style={{ gridColumn: "span 6" }} />

        <OverviewCard
          span={3}
          title={tCalendar("widget.title")}
          action={
            <Link
              href={`${base}/calendar`}
              className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline"
            >
              {tCalendar("widget.viewAll")}
            </Link>
          }
        >
          <MyCalendarWidget embedded />
        </OverviewCard>

        {/* Row 2 — the decisions: today's play, the daily brief, the funnel. */}
        <OverviewCard span={4} title={tFeed("title")} caption={tFeed("eyebrow")}>
          <DecisionFeed embedded />
        </OverviewCard>

        <OverviewCard span={5} title={tBrief("title")} caption={t("sections.brief.caption")}>
          <DailyBrief embedded />
        </OverviewCard>

        <OverviewCard span={3} title={t("sections.funnel.title")} caption={t("sections.funnel.caption")}>
          <PipelineFunnel
            opportunities={allOppsResult?.data ?? []}
            className="grid grid-cols-2 content-start gap-4"
            compact
          />
        </OverviewCard>

        {/* Row 3 — the patterns. */}
        <OverviewCard span={6} title={t("sections.industryHeatmap.title")} caption={t("sections.industryHeatmap.caption")}>
          <IndustrySignalHeatmap
            opportunities={allOppsResult?.data ?? []}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </OverviewCard>

        <OverviewCard span={6} title={t("sections.activityHeatmap.title")} caption={t("sections.activityHeatmap.caption")}>
          <SignalActivityHeatmap signals={signals} />
        </OverviewCard>
      </div>
    </>
  );
}
