import { Activity, Flame, Radio, ShieldCheck, TrendingUp } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PendingActionsPanel } from "@/components/pending-actions";
import { RevenueSimulatorWidget } from "@/components/revenue-simulator";
import { SignalCard } from "@/components/signal-card";
import { WorkflowStatusPanel } from "@/components/workflow-status";
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
    <>
      <DashboardHeader
        title="Daily Operation"
        subtitle="Real-time market triggers → CEO battlecards → closed deals."
        live={live}
        kpis={[
          { label: "Signals tracked", value: signals.length, icon: Radio },
          { label: "High-intent", value: hotSignals, hint: "score ≥ 75", icon: TrendingUp },
          {
            label: "Ready to action",
            value: readyCount,
            hint: "battlecard complete",
            icon: ShieldCheck,
          },
          {
            label: "Hot leads",
            value: hotLeads,
            hint: "buying intent",
            icon: Flame,
          },
          { label: "Avg. score", value: avgScore, icon: Activity },
        ]}
      />

      <div className="bee-scroll">
        <div className="bee-bento-grid">
          {/* Battlecards — primary editorial block */}
          {battlecards.length > 0 && (
            <section className="bee-span-8 space-y-3">
              <div>
                <p className="bee-eyebrow">CEO Battlecards</p>
                <h2 className="mt-1 text-base font-semibold">
                  Fully enriched briefs
                </h2>
                <p className="bee-caption">
                  Pain point · closing argument · timing window
                </p>
              </div>
              <div className="grid gap-3">
                {battlecards.map((card, i) => (
                  <div
                    key={card.opportunity_id}
                    className={`bee-bento bee-bento-pad-lg ${
                      i % 2 === 0 ? "bee-bento--primary" : ""
                    }`}
                  >
                    <BattlecardView card={card} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* BOS stack — right column */}
          <section className={`${battlecards.length > 0 ? "bee-span-4" : "bee-span-12"} space-y-3`}>
            <div>
              <p className="bee-eyebrow">Business Operating System</p>
              <h2 className="mt-1 text-base font-semibold">Automation layer</h2>
              <p className="bee-caption">
                Revenue · workflows · execution queue
              </p>
            </div>
            <div className="space-y-3">
              <RevenueSimulatorWidget />
              <WorkflowStatusPanel />
              <PendingActionsPanel />
            </div>
          </section>

          {/* Signals feed — full width */}
          <section className="bee-span-12 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="bee-eyebrow">Signal feed</p>
                <h2 className="mt-1 text-base font-semibold">All signals</h2>
              </div>
              <span className="bee-caption">{signals.length} total</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {signals.map((signal, i) => (
                <SignalCard key={signal.id} signal={signal} toneIndex={i} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
