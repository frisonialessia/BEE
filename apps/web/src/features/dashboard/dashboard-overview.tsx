"use client";

import { Activity, Bot, Flame, ShieldCheck, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { IndustrySignalHeatmap } from "@/components/dashboard/industry-signal-heatmap";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { SignalActivityHeatmap } from "@/components/dashboard/signal-activity-heatmap";
import { TodayImpactCard } from "@/components/dashboard/today-impact-card";
import { MetricCard } from "@/components/metric-card";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { SignalCard } from "@/components/signal-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { SignalHexMap } from "@/features/control/components/SignalHexMap";
import { CriticalAccountsDigest } from "@/features/dashboard/critical-accounts-digest";
import { DailyBrief } from "@/features/dashboard/daily-brief";
import { DecisionFeed } from "@/features/dashboard/decision-feed";
import { Leaderboard } from "@/features/dashboard/leaderboard";
import { MyCalendarWidget } from "@/features/calendar/my-calendar-widget";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import { computeTodayImpact } from "@/lib/today-impact";
import { bucketAverageByDay, bucketByDay } from "@/lib/trend";

/**
 * Resumen — the analytics tool: KPI strip, enriched battlecards, and the
 * live signal feed. The operational panels (brand, network, dark funnel,
 * sequences, resilience) each have their own dedicated route — see the
 * rail nav — so this page stays a focused overview rather than a
 * kitchen-sink dashboard.
 */
export function DashboardOverview() {
  const t = useTranslations("dashboardOverview.overview");
  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();
  const { data: allOppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 200);
  const { data: usersResult, isLoading: usersLoading } = useUsers();
  const { data: teamsResult } = useTeams();
  const { data: companiesResult } = useCompanies(200);
  const { openOpportunity } = useOpportunityDrawer();

  const signals = signalsResult?.data ?? [];
  const battlecards = battlecardsResult?.data ?? [];
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  // Incluye opps/users: sin esto, el Leaderboard alcanza a renderizar su
  // "todavía no hay ganadas" antes de que esas dos queries respondan —
  // un vacío que parece confirmado sin serlo.
  const loading = signalsLoading || battlecardsLoading || oppsLoading || usersLoading;

  const battlecardPagination = usePagination(battlecards);
  const signalPagination = usePagination(signals);

  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignalsList = signals.filter((s) => s.score >= 75);
  const hotSignals = hotSignalsList.length;
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const hotLeads = battlecards.filter((b) => b.hot_lead).length;

  // Tendencia de 7 días — calculada a partir de las señales/battlecards ya
  // obtenidas (detected_at/created_at real), no inventada. readyCount y
  // hotLeads usan created_at del battlecard como proxy honesto de "cuándo
  // pasó esto" — BEE no guarda por separado el momento exacto en que un
  // battlecard cruzó a ready/hot, así que created_at es lo más cercano sin
  // fabricar un dato que no existe.
  const signalsTrend = bucketByDay(signals.map((s) => s.detected_at), 7);
  const hotSignalsTrend = bucketByDay(hotSignalsList.map((s) => s.detected_at), 7);
  const readyTrend = bucketByDay(
    battlecards.filter((b) => b.ready_to_action).map((b) => b.created_at),
    7,
  );
  const hotLeadsTrend = bucketByDay(
    battlecards.filter((b) => b.hot_lead).map((b) => b.created_at),
    7,
  );
  // Promedio, no conteo — un día sin señales se omite en vez de mostrar un
  // score de 0 que se leería como "se desplomó".
  const avgScoreTrend = bucketAverageByDay(
    signals.map((s) => ({ date: s.detected_at, value: s.score })),
    7,
  ).filter((v): v is number => v !== null);
  const todayImpact = computeTodayImpact(signals, allOppsResult?.data ?? [], new Date());

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="bee-topbar -mx-5 -mt-4 mb-4 px-5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? t("statusLive") : t("statusDemo")}
          </Badge>
        </div>

        <div className="bee-kpi-strip">
          <MetricCard label={t("kpis.signals")} value={signals.length} icon={Activity} trend={signalsTrend} />
          <MetricCard
            label={t("kpis.hotSignals")}
            value={hotSignals}
            hint={t("kpis.hotSignalsHint")}
            icon={TrendingUp}
            trend={hotSignalsTrend}
          />
          <MetricCard
            label={t("kpis.ready")}
            value={readyCount}
            hint={t("kpis.readyHint")}
            icon={ShieldCheck}
            trend={readyTrend}
          />
          <MetricCard
            label={t("kpis.hotLeads")}
            value={hotLeads}
            hint={t("kpis.hotLeadsHint")}
            icon={Flame}
            trend={hotLeadsTrend}
          />
          <MetricCard label={t("kpis.avgScore")} value={avgScore} icon={Activity} trend={avgScoreTrend} />
        </div>
      </header>

      <DecisionFeed />
      <TodayImpactCard impact={todayImpact} />
      <CriticalAccountsDigest battlecards={battlecards} today={new Date()} />
      <DailyBrief />

      {/* Colmena (inteligencia de mercado) como pieza hero a 2/3 de ancho —
          a 1/3 quedaba tan angosta que los hexágonos se veían apretados y
          hasta recortados contra el borde de la tarjeta. Mi calendario y el
          Leaderboard van apilados en la columna restante. items-start (no
          el items-stretch por default de grid) para que cada columna mida
          según su propio contenido — con items-stretch, Mi calendario y el
          Leaderboard se estiraban a la altura de la Colmena y dejaban un
          bloque de espacio en blanco debajo de su contenido real. */}
      <div className="mb-4 grid items-start gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SignalHexMap height={280} />
        </div>
        <div className="flex flex-col gap-3">
          <MyCalendarWidget />
          <Leaderboard
            opportunities={allOppsResult?.data ?? []}
            users={usersResult ?? []}
            teams={teamsResult ?? []}
          />
        </div>
      </div>

      <div className="mb-4 grid items-start gap-3 lg:grid-cols-2">
        <section className="bee-surface bee-bento-pad space-y-3">
          <div>
            <h3 className="bee-card-title">{t("sections.industryHeatmap.title")}</h3>
            <p className="bee-caption">{t("sections.industryHeatmap.caption")}</p>
          </div>
          <IndustrySignalHeatmap
            opportunities={allOppsResult?.data ?? []}
            signals={signals}
            companies={companiesResult?.data ?? []}
          />
        </section>

        <section className="bee-surface bee-bento-pad space-y-3">
          <div>
            <h3 className="bee-card-title">{t("sections.activityHeatmap.title")}</h3>
            <p className="bee-caption">{t("sections.activityHeatmap.caption")}</p>
          </div>
          <SignalActivityHeatmap signals={signals} />
        </section>
      </div>

      <section className="mb-4 space-y-3">
        <div>
          <h3 className="bee-card-title">{t("sections.funnel.title")}</h3>
          <p className="bee-caption">{t("sections.funnel.caption")}</p>
        </div>
        <PipelineFunnel opportunities={allOppsResult?.data ?? []} />
      </section>

      <div className="bee-bento-grid">
        {battlecards.length > 0 && (
          <section className="bee-span-8 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="bee-card-title">{t("sections.battlecards.title")}</h3>
                <p className="bee-caption">{t("sections.battlecards.caption")}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bot className="size-3.5" />
                {t("sections.battlecards.strategyBadge")}
              </span>
            </div>

            <div className="grid gap-3">
              {battlecardPagination.pageItems.map((card, i) => (
                <button
                  key={card.opportunity_id}
                  type="button"
                  onClick={() => openOpportunity(card.opportunity_id)}
                  className={`bee-bento bee-bento-pad-lg text-left transition-colors hover:border-[var(--color-chart-4)] ${
                    i % 2 === 0 ? "bee-bento--primary" : ""
                  }`}
                >
                  <BattlecardView card={card} />
                </button>
              ))}
            </div>

            <PaginationBar
              page={battlecardPagination.page}
              pageSize={battlecardPagination.pageSize}
              totalPages={battlecardPagination.totalPages}
              totalItems={battlecardPagination.totalItems}
              onPageChange={battlecardPagination.goToPage}
              onPageSizeChange={battlecardPagination.changePageSize}
              itemLabel={t("itemLabels.battlecards")}
            />
          </section>
        )}

        <section className={`${battlecards.length > 0 ? "bee-span-4" : "bee-span-12"} space-y-3`}>
          <div>
            <h3 className="bee-card-title">{t("sections.revenueSimulator.title")}</h3>
            <p className="bee-caption">{t("sections.revenueSimulator.caption")}</p>
          </div>
          <RevenueSimulatorWidget />
        </section>

        <section className="bee-span-12 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h3 className="bee-card-title">{t("sections.allSignals.title")}</h3>
            <span className="bee-caption">{t("sections.allSignals.total", { count: signals.length })}</span>
          </div>

          {signals.length === 0 ? (
            <p className="bee-caption py-6 text-center">{t("sections.allSignals.empty")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {signalPagination.pageItems.map((signal, i) => (
                <SignalCard key={signal.id} signal={signal} toneIndex={i} />
              ))}
            </div>
          )}

          <PaginationBar
            page={signalPagination.page}
            pageSize={signalPagination.pageSize}
            totalPages={signalPagination.totalPages}
            totalItems={signalPagination.totalItems}
            onPageChange={signalPagination.goToPage}
            onPageSizeChange={signalPagination.changePageSize}
            itemLabel={t("itemLabels.signals")}
          />
        </section>
      </div>
    </>
  );
}
