"use client";

import { Activity, Bot, Flame, ShieldCheck, TrendingUp } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { BrandVoicePanel } from "@/components/brand-voice";
import { DarkFunnelDashboard } from "@/components/dark-funnel-dashboard";
import { EngagementInboxPanel } from "@/components/engagement-inbox";
import { MetricCard } from "@/components/metric-card";
import { NetworkNavigatorPanel } from "@/components/network-navigator";
import { PendingActionsPanel } from "@/components/pending-actions";
import { DeepLearningPanel } from "@/components/deep-learning-panel";
import { ResiliencePanel } from "@/components/resilience-panel";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { WorkflowStatusPanel } from "@/components/workflow-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBattlecards } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";

export function DashboardOverview() {
  const { data: signalsResult, isLoading: signalsLoading } = useSignals();
  const { data: battlecardsResult, isLoading: battlecardsLoading } = useBattlecards();

  const signals = signalsResult?.data ?? [];
  const battlecards = battlecardsResult?.data ?? [];
  const live = Boolean(signalsResult?.live || battlecardsResult?.live);
  const loading = signalsLoading || battlecardsLoading;

  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignals = signals.filter((s) => s.score >= 75).length;
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const hotLeads = battlecards.filter((b) => b.hot_lead).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signal Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time market triggers → CEO battlecards → closed deals.
          </p>
        </div>
        <Badge variant={live ? "success" : "warning"}>
          {live ? "Live · connected to API" : "Demo data · API offline"}
        </Badge>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Signals tracked" value={signals.length} icon={Activity} />
        <MetricCard label="High-intent" value={hotSignals} hint="score ≥ 75" icon={TrendingUp} />
        <MetricCard
          label="Ready to action"
          value={readyCount}
          hint="battlecard complete"
          icon={ShieldCheck}
        />
        <MetricCard label="Hot leads" value={hotLeads} hint="buying intent detected" icon={Flame} />
        <MetricCard label="Avg. score" value={avgScore} icon={Activity} />
      </section>

      {battlecards.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">CEO Battlecards</h2>
              <p className="text-sm text-muted-foreground">
                Fully enriched briefs — pain point · closing argument · timing window.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="size-3.5" />
              Strategy generated · rule_based
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {battlecards.slice(0, 4).map((card) => (
              <Card key={card.opportunity_id}>
                <CardContent className="p-6">
                  <BattlecardView card={card} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Business Operating System</h2>
          <p className="text-sm text-muted-foreground">
            Event-driven automation · Resource intelligence · Revenue projections
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RevenueSimulatorWidget />
          <WorkflowStatusPanel />
          <PendingActionsPanel />
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Autonomous Growth</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Personal brand + omnichannel prospecting — CEO approval required
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BrandVoicePanel />
          <EngagementInboxPanel />
        </div>
      </section>

      <section className="mt-10">
        <DarkFunnelDashboard />
      </section>

      <section className="mt-10">
        <NetworkNavigatorPanel />
      </section>

      <section className="mt-10">
        <DeepLearningPanel />
      </section>

      <section className="mt-10">
        <ResiliencePanel />
      </section>
    </>
  );
}
