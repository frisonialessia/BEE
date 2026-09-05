"use client";

import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useQuickScenario } from "@/hooks/queries/use-analytics";

/** "Simulador rápido" — the RevenueSimulator (analytics.py's own
 *  `/analytics/simulator`) had a real backend and a real demo path since
 *  before this card existed, but nothing in the UI ever called either —
 *  this is its first real home. Real closed-deal win-rate data (this
 *  org's own, or the sandbox's own seeded deals), projected under double
 *  prospecting on funding-round signals — the same "what if" the landing's
 *  own simulator only pretends to compute. */
export function RevenueSimulatorCard() {
  const t = useTranslations("dashboardOverview.overview.sections.revenueSimulator");
  const { data, isLoading } = useQuickScenario();
  const sim = data?.data ?? null;

  if (isLoading) return <Skeleton className="h-full min-h-[8rem]" />;
  if (!sim || sim.data_confidence === "none") {
    return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  }

  // Order is always conservative → realistic → optimistic (see
  // revenue_simulator/service.py and demo/overview.ts's own mirror).
  const realistic = sim.scenarios[1] ?? sim.scenarios[0];

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="bee-micro">{t("signalType")}</p>
      <div className="grid flex-1 grid-cols-2 gap-3">
        <div>
          <p className="bee-caption">{t("baseline")}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{sim.baseline_expected_won}</p>
        </div>
        <div>
          <p className="bee-caption">{t("projected")}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{realistic?.projected_won_deals ?? "—"}</p>
        </div>
      </div>
      <p className="bee-micro">{t(`confidence.${sim.data_confidence}`)}</p>
    </div>
  );
}
