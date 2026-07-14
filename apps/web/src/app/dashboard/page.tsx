import { Activity, Bot, Flame, Network, Radio, ShieldCheck, TrendingUp, Zap } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { BrandVoicePanel } from "@/components/brand-voice";
import { DarkFunnelDashboard } from "@/components/dark-funnel-dashboard";
import { EngagementInboxPanel } from "@/components/engagement-inbox";
import { MetricCard } from "@/components/metric-card";
import { NetworkNavigatorPanel } from "@/components/network-navigator";
import { PendingActionsPanel } from "@/components/pending-actions";
import { ResiliencePanel } from "@/components/resilience-panel";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { SignalCard } from "@/components/signal-card";
import { SiteHeader } from "@/components/site-header";
import { WorkflowStatusPanel } from "@/components/workflow-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getBattlecards, getSignals } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ data: signals, live: signalsLive }, { data: battlecards, live: battlecardsLive }] =
    await Promise.all([getSignals(), getBattlecards()]);

  const live = signalsLive || battlecardsLive;
  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignals = signals.filter((s) => s.score >= 75).length;
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const hotLeads = battlecards.filter((b) => b.hot_lead).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {/* Page header */}
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

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <MetricCard label="Signals tracked" value={signals.length} icon={Radio} />
          <MetricCard label="High-intent" value={hotSignals} hint="score ≥ 75" icon={TrendingUp} />
          <MetricCard
            label="Ready to action"
            value={readyCount}
            hint="battlecard complete"
            icon={ShieldCheck}
          />
          <MetricCard label="Hot leads 🔥" value={hotLeads} hint="buying intent detected" icon={Flame} />
          <MetricCard label="Avg. score" value={avgScore} icon={Activity} />
        </section>

        {/* Battlecards */}
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
              {battlecards.map((card) => (
                <Card key={card.opportunity_id}>
                  <CardContent className="p-6">
                    <BattlecardView card={card} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* BOS Intelligence Layer */}
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

        {/* Autonomous Growth Layer */}
        <section className="mt-10">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Autonomous Growth</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Personal brand + omnichannel prospecting — all actions require CEO approval before firing
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BrandVoicePanel />
            <EngagementInboxPanel />
          </div>
        </section>

        {/* Psychology & Network Intelligence */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-white">Dark Funnel — Hot Leads</h2>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Companies in active research mode — captured from anonymous visits, review sites, competitor comparisons.
            Sorted by research intensity score. These leads are looking for a solution before they reach out.
          </p>
          <DarkFunnelDashboard />
        </section>

        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-white">Network Navigator — Warm Intros</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Map introduction paths through your professional network. Warm intros close 5-10× faster than cold outreach.
            Find the shortest, strongest path to any target company.
          </p>
          <NetworkNavigatorPanel />
        </section>

        {/* Resilience & Observability */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-white">Resilience & Observability</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Dead Letter Queue monitors failed external actions with automatic exponential-backoff retry.
            Audit Trail records every agent decision — context used, market data consulted, strategy reasoning,
            and confidence score. Low-confidence decisions (&lt;80%) are flagged for manual CEO review.
          </p>
          <ResiliencePanel />
        </section>

        {/* Signals feed */}
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">All signals</h2>
          </div>
          <div className="flex flex-col gap-3">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
