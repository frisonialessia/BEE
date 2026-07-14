import { Activity, Radio, Target, TrendingUp } from "lucide-react";

import { MetricCard } from "@/components/metric-card";
import { OpportunityCard } from "@/components/opportunity-card";
import { SignalCard } from "@/components/signal-card";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { getSignals } from "@/lib/api";
import { sampleOpportunities } from "@/lib/sample-data";
import type { Opportunity, Signal } from "@/lib/types";

// Always render fresh so newly ingested signals appear on reload.
export const dynamic = "force-dynamic";

/** Derive lightweight opportunities from live signals for display purposes.
 * (In production the API exposes opportunities directly; this keeps the demo
 * dashboard coherent when only the signals endpoint is queried.) */
function opportunitiesFromSignals(signals: Signal[]): Opportunity[] {
  return signals
    .filter((s) => s.score >= 50)
    .slice(0, 6)
    .map((s) => ({
      id: `opp-${s.id}`,
      title: `Opportunity: ${s.title}`,
      status: s.score >= 75 ? "prioritized" : "detected",
      score: s.score,
      strategy: {
        next_best_action: s.score >= 75 ? "reach_out" : "monitor",
        channel: "email",
        rationale: s.description ?? undefined,
      },
      signal_id: s.id,
      lead_id: s.lead_id,
      company_id: s.company_id,
    }));
}

export default async function DashboardPage() {
  const { data: signals, live } = await getSignals();

  const opportunities = live ? opportunitiesFromSignals(signals) : sampleOpportunities;

  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const hotSignals = signals.filter((s) => s.score >= 75).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Signal Intelligence</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time market triggers scored and converted into opportunities.
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? "Live · connected to API" : "Demo data · API offline"}
          </Badge>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Signals tracked" value={signals.length} icon={Radio} />
          <MetricCard label="High-intent" value={hotSignals} hint="score ≥ 75" icon={TrendingUp} />
          <MetricCard label="Opportunities" value={opportunities.length} icon={Target} />
          <MetricCard label="Avg. score" value={avgScore} icon={Activity} />
        </section>

        {/* Two columns: signals + opportunities */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Latest signals
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              {signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          </section>

          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Prioritized opportunities
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No opportunities yet — send a signal to the engine.
                </p>
              ) : (
                opportunities.map((opportunity) => (
                  <OpportunityCard key={opportunity.id} opportunity={opportunity} />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
