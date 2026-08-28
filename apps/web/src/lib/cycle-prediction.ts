/**
 * JS port of app.services.cycle_predictor.service.CyclePredictorService for
 * /probar (the sandbox has no backend to call). Keep this in lockstep with
 * that Python implementation — same tiers, same _MIN_COHORT, same median,
 * same honesty guardrails (available=false + reason rather than a number
 * backed by too little data). See that module's docstring for the full
 * rationale.
 *
 * The one structural difference from the backend: the demo's Opportunity
 * has no Company row to join against, so "industry" here comes from the
 * matching Battlecard's `company.industry` instead of a company_id lookup —
 * the same information, just reached through the shape the demo actually
 * has.
 */
import type { Battlecard, Opportunity, Signal } from "@/types/domain";
import type { CyclePrediction } from "@/types/extended";

const MIN_COHORT = 3;
const CLOSED_STATUSES = new Set(["won", "lost"]);

interface ClosedDeal {
  cycleDays: number;
  signalType: string | null;
  industry: string | null;
}

function industryFor(opportunity: Opportunity, battlecards: Battlecard[]): string | null {
  return battlecards.find((b) => b.opportunity_id === opportunity.id)?.company.industry ?? null;
}

function signalTypeFor(opportunity: Opportunity, signals: Signal[]): string | null {
  return signals.find((s) => s.id === opportunity.signal_id)?.signal_type ?? null;
}

function closedDeals(
  opportunities: Opportunity[],
  signals: Signal[],
  battlecards: Battlecard[],
): ClosedDeal[] {
  const deals: ClosedDeal[] = [];
  for (const o of opportunities) {
    if (!CLOSED_STATUSES.has(o.status) || !o.closed_at) continue;
    const cycleDays = (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86_400_000;
    if (cycleDays < 0) continue; // data integrity guard — never let a bad row skew the median
    deals.push({
      cycleDays,
      signalType: signalTypeFor(o, signals),
      industry: industryFor(o, battlecards),
    });
  }
  return deals;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bestCohort(
  deals: ClosedDeal[],
  signalType: string | null,
  industry: string | null,
): { cohort: ClosedDeal[]; basis: string } | null {
  const tiers: { cohort: ClosedDeal[]; basis: string }[] = [];
  if (signalType && industry) {
    tiers.push({
      cohort: deals.filter((d) => d.signalType === signalType && d.industry === industry),
      basis: "deals cerrados similares por tipo de señal e industria",
    });
  }
  if (signalType) {
    tiers.push({
      cohort: deals.filter((d) => d.signalType === signalType),
      basis: "deals cerrados similares por tipo de señal",
    });
  }
  if (industry) {
    tiers.push({
      cohort: deals.filter((d) => d.industry === industry),
      basis: "deals cerrados similares por industria",
    });
  }
  tiers.push({ cohort: deals, basis: "todos los deals cerrados de la cuenta" });

  return tiers.find((t) => t.cohort.length >= MIN_COHORT) ?? null;
}

const NOT_AVAILABLE = (reason: string): CyclePrediction => ({
  available: false,
  predicted_cycle_days: null,
  predicted_close_date: null,
  days_elapsed: null,
  days_remaining: null,
  is_overdue: false,
  cohort_size: 0,
  cohort_basis: null,
  confidence: null,
  reason,
});

/** Predicts time-to-close for `target` using this sandbox's own comparable
 * closed deals (won or lost). Mirrors CyclePredictorService.predict() —
 * see that module's docstring for the algorithm and honesty guardrails. */
export function predictCycle(
  target: Opportunity,
  opportunities: Opportunity[],
  signals: Signal[],
  battlecards: Battlecard[],
): CyclePrediction {
  if (CLOSED_STATUSES.has(target.status) || target.status === "dismissed") {
    return NOT_AVAILABLE("Esta oportunidad ya está cerrada — no hay nada que predecir.");
  }

  const deals = closedDeals(opportunities, signals, battlecards);
  if (deals.length < MIN_COHORT) {
    return NOT_AVAILABLE("Todavía no hay suficientes deals cerrados en esta cuenta para predecir un ciclo.");
  }

  const targetSignalType = signalTypeFor(target, signals);
  const targetIndustry = industryFor(target, battlecards);

  const best = bestCohort(deals, targetSignalType, targetIndustry);
  if (!best) {
    return NOT_AVAILABLE("No encontramos deals cerrados lo bastante parecidos todavía.");
  }

  const predictedCycle = median(best.cohort.map((d) => d.cycleDays));
  const createdAt = new Date(target.created_at);
  const now = new Date();
  const daysElapsed = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
  const daysRemaining = Math.round(predictedCycle) - daysElapsed;
  const predictedCloseDate = new Date(createdAt.getTime() + predictedCycle * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const confidence = best.cohort.length >= 10 ? "high" : best.cohort.length >= 5 ? "medium" : "low";

  return {
    available: true,
    predicted_cycle_days: Math.round(predictedCycle * 10) / 10,
    predicted_close_date: predictedCloseDate,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    is_overdue: daysRemaining < 0,
    cohort_size: best.cohort.length,
    cohort_basis: best.basis,
    confidence,
    reason: null,
  };
}
