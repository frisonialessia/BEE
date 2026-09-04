"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AntiBurnoutCard } from "@/components/celebration/anti-burnout-card";
import { useMilestoneCelebration } from "@/components/celebration/use-milestone-celebration";
import { WeeklyRecapCard } from "@/components/celebration/weekly-recap-card";
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
import { useLeads } from "@/hooks/queries/use-leads";
import { useMeetings } from "@/hooks/queries/use-meetings";
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
import { isQuotaActive } from "@/lib/quotas";
import { buildSalesModel } from "@/lib/sales-model";
import { useAuth } from "@/providers/auth-provider";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// A rep with this many meetings in the current calendar week gets the
// "active meetings week" badge on the milestone path — a real threshold,
// not every week with at least one meeting on the calendar.
const HIGH_MEETING_WEEK_THRESHOLD = 4;

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

  // Real session on the dashboard; the sandbox has none (see
  // my-calendar-widget.tsx's own docstring) so the first seeded teammate
  // stands in as "you" there — same fallback account-menu-demo.tsx uses.
  const { user: authUser } = useAuth();
  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();
  const { data: allOppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 700);
  const { data: usersResult, isLoading: usersLoading } = useUsers();
  const { data: companiesResult } = useCompanies(200);
  const { data: teamsData } = useTeams();
  const { data: quotasResult } = useQuotas();
  const { data: hiveResult } = useHiveLeads(200);
  const { data: leadsResult } = useLeads(200);
  const { data: meetingsResult } = useMeetings();

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
  // Only a real, well-below-average week counts as slow — never a single
  // noisy day-to-day dip, and never when there's too little history yet.
  const marketSlow = useMemo(() => {
    const trailing = weekly.slice(0, 7).filter((v) => v > 0);
    if (trailing.length < 3) return false;
    const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
    return weekly[7] < avg * 0.5;
  }, [weekly]);

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

  // Real accounts to suggest on a slow week — the hottest ones not yet in
  // motion, from the same hive data the centre box already fetched.
  const burnoutLeads = useMemo(
    () =>
      [...hiveLeads]
        .filter((l) => stageOf(l) === "ready_to_buy" || (l.manual_temperature === null && l.is_hot))
        .sort((a, b) => b.research_intensity_score - a.research_intensity_score)
        .slice(0, 4)
        .map((l) => ({ id: l.id, label: l.company_name ?? l.company_domain })),
    [hiveLeads],
  );

  // "Tu semana en BEE" — every number here is scoped to this one rep, not
  // the team: streak, signals, closes, the milestone road. `meId` is the
  // real session's user on the dashboard; the sandbox has none, so the
  // first seeded teammate (same one account-menu-demo.tsx shows as "you")
  // stands in there.
  const meId = authUser?.id ?? usersResult?.[0]?.id ?? null;
  const myOpps = useMemo(() => (allOppsResult?.data ?? []).filter((o) => o.assigned_to_user_id === meId), [allOppsResult, meId]);
  const myWonAll = useMemo(() => myOpps.filter((o) => o.status === "won" && o.closed_at), [myOpps]);
  const myTotalWon = myWonAll.length;
  const myWonThisWeek = useMemo(() => myWonAll.filter((o) => now - new Date(o.closed_at as string).getTime() < WEEK_MS).length, [myWonAll, now]);
  const myWonLastWeek = useMemo(
    () => myWonAll.filter((o) => { const age = now - new Date(o.closed_at as string).getTime(); return age >= WEEK_MS && age < 2 * WEEK_MS; }).length,
    [myWonAll, now],
  );
  const myWonDelta = myWonLastWeek > 0 ? (myWonThisWeek - myWonLastWeek) / myWonLastWeek : null;

  // Consecutive days, ending today, with at least one deal *this rep*
  // closed — today doesn't break the count while it's still in progress:
  // judged from yesterday back until today closes something of its own.
  const myStreakDays = useMemo(() => {
    const closedDays = new Set(myWonAll.map((o) => new Date(o.closed_at as string).toDateString()));
    const cursor = new Date(now);
    if (!closedDays.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (closedDays.has(cursor.toDateString())) {
      days += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return days;
  }, [myWonAll, now]);

  // Signals don't belong to a rep in the data model (they're market
  // detections, not an action a person took) — the honest personal scope
  // is "signals on accounts you actually have an opportunity for", not a
  // fabricated per-rep signal feed.
  const myCompanyIds = useMemo(() => new Set(myOpps.map((o) => o.company_id).filter((id): id is string => Boolean(id))), [myOpps]);
  const mySignals = useMemo(() => signals.filter((s) => s.company_id && myCompanyIds.has(s.company_id)), [signals, myCompanyIds]);
  const mySignalsThisWeek = useMemo(() => mySignals.filter((s) => now - new Date(s.detected_at).getTime() < WEEK_MS).length, [mySignals, now]);
  const mySignalsLastWeek = useMemo(
    () => mySignals.filter((s) => { const age = now - new Date(s.detected_at).getTime(); return age >= WEEK_MS && age < 2 * WEEK_MS; }).length,
    [mySignals, now],
  );
  const mySignalsDelta = mySignalsLastWeek > 0 ? (mySignalsThisWeek - mySignalsLastWeek) / mySignalsLastWeek : null;

  // Same three real actions the milestone path's badge prelude shows
  // (see milestone-path.tsx): a lead this rep added, an organization this
  // rep added — both honest per-rep counts now that demo/store.ts stamps
  // Lead.assigned_to_user_id/Company.owner_user_id instead of leaving them
  // null — and whether this calendar week (Monday-anchored, same as the
  // seeded meetings themselves) crossed the "busy" threshold.
  const myLeadsThisWeek = useMemo(
    () => (leadsResult?.data ?? []).filter((l) => l.assigned_to_user_id === meId && now - new Date(l.created_at).getTime() < WEEK_MS).length,
    [leadsResult, meId, now],
  );
  const myCompaniesThisWeek = useMemo(
    () => (companiesResult?.data ?? []).filter((c) => c.owner_user_id === meId && now - new Date(c.created_at).getTime() < WEEK_MS).length,
    [companiesResult, meId, now],
  );
  const weekBounds = useMemo(() => {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - dow);
    const start = d.getTime();
    return { start, end: start + WEEK_MS };
  }, [now]);
  const myMeetingsThisWeek = useMemo(() => {
    if (!meId) return 0;
    return (meetingsResult ?? []).filter((m) => {
      if (m.created_by_user_id !== meId && !m.attendee_user_ids.includes(meId)) return false;
      const at = new Date(m.starts_at).getTime();
      return at >= weekBounds.start && at < weekBounds.end;
    }).length;
  }, [meetingsResult, meId, weekBounds]);
  const weeklyEvents = {
    leadsAdded: myLeadsThisWeek,
    companiesAdded: myCompaniesThisWeek,
    activeMeetingsWeek: myMeetingsThisWeek >= HIGH_MEETING_WEEK_THRESHOLD,
  };

  // The manager-set monthly goal for this rep, when one exists (see
  // quotas-section.tsx / the invite form) — a deal-count target for the
  // *current period*, not a lifetime number, so it's judged against this
  // month's wins, never against totalWon (which is all-time and would
  // almost always already be past a small monthly target).
  const monthlyGoal = useMemo(() => {
    const quota = (quotasResult?.data ?? []).find((q) => q.user_id === meId && isQuotaActive(q, new Date(now)));
    if (!quota?.target_count) return null;
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const current = myWonAll.filter((o) => new Date(o.closed_at as string).getTime() >= monthStart).length;
    return { current, target: quota.target_count };
  }, [quotasResult, meId, now, myWonAll]);

  // Only shown when this rep actually won something this week — a rank
  // with no wins to earn it would be a made-up "last place", not a fact.
  const teamRank = useMemo(() => {
    if (!meId) return null;
    const byUser = new Map<string, number>();
    for (const o of allOppsResult?.data ?? []) {
      if (o.status !== "won" || !o.assigned_to_user_id || !o.closed_at) continue;
      if (now - new Date(o.closed_at).getTime() >= WEEK_MS) continue;
      byUser.set(o.assigned_to_user_id, (byUser.get(o.assigned_to_user_id) ?? 0) + (o.amount ?? 0));
    }
    const ranked = [...byUser.entries()].sort((a, b) => b[1] - a[1]);
    const idx = ranked.findIndex(([id]) => id === meId);
    return idx === -1 ? null : { rank: idx + 1 };
  }, [allOppsResult, meId, now]);

  useMilestoneCelebration(myTotalWon);

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
    >
      {/* "Tu semana en BEE" leads the page — it's the one personal, always-
          there fixture — with the KPI strip right above the hive instead of
          right under the header (the one page that departs from Rule 11's
          usual "header → KPIs" rhythm, on purpose: here the personal recap
          outranks the strip). */}
      <WeeklyRecapCard
        streakDays={myStreakDays}
        signalsThisWeek={mySignalsThisWeek}
        signalsDelta={mySignalsDelta}
        wonThisWeek={myWonThisWeek}
        wonDelta={myWonDelta}
        totalWon={myTotalWon}
        monthlyGoal={monthlyGoal}
        teamRank={teamRank}
        weeklyEvents={weeklyEvents}
      />

      <GettingStartedCard signalCount={signals.length} opportunityCount={allOppsResult?.data.length ?? 0} userCount={usersResult?.length ?? 0} />

      {marketSlow && <AntiBurnoutCard leads={burnoutLeads} />}

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
        <OverviewCard
          span={4}
          title={t("sections.ranking.title")}
          caption={t("sections.ranking.caption")}
          className="lg:min-h-[24rem]!"
          action={<CardLink href={`${base}/sales`}>{t("sections.ranking.link")}</CardLink>}
        >
          <TeamGoalRanking days={90} bars />
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
