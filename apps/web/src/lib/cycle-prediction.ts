/**
 * JS port of app.services.cycle_predictor.service.CyclePredictorService for
 * /probar (the sandbox has no backend to call). Keep this in lockstep with
 * that Python implementation — same tiers, same _MIN_COHORT, same median,
 * same honesty guardrails (available=false + reason rather than a number
 * backed by too little data), plus the same signal-recalibration split
 * (see below). See that module's docstring for the full rationale.
 *
 * The one structural difference from the backend: the demo's Opportunity
 * has no Company row to join against, so "industry" here comes from the
 * matching Battlecard's `company.industry` instead of a company_id lookup —
 * the same information, just reached through the shape the demo actually
 * has. `company_id` itself (needed for signal recalibration, below) IS
 * populated on the demo's Opportunity/Signal records — see
 * lib/demo/seed-history.ts.
 */
import { getClientLocale } from "@/i18n/client-locale";
import type { Battlecard, Opportunity, Signal } from "@/types/domain";
import type { CyclePrediction, CycleSignalRecalibration } from "@/types/extended";

const MIN_COHORT = 3;
const MIN_SIGNAL_COHORT = 3;
const CLOSED_STATUSES = new Set(["won", "lost"]);

interface ClosedDeal {
  cycleDays: number;
  signalType: string | null;
  industry: string | null;
  opportunity: Opportunity;
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
      opportunity: o,
    });
  }
  return deals;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}


/** Sandbox copy for the prediction's explanations, in the UI language
 *  (the real endpoint's CyclePredictorService writes these server-side). */
const COPY = {
  es: {
    basisTypeIndustry: "deals cerrados similares por tipo de señal e industria",
    basisType: "deals cerrados similares por tipo de señal",
    basisIndustry: "deals cerrados similares por industria",
    basisAll: "todos los deals cerrados de la cuenta",
    notEnoughSignalCohort:
      "Todavía no hay suficientes deals cerrados con y sin una señal nueva de mercado durante el ciclo para comparar.",
    alreadyClosed: "Esta oportunidad ya está cerrada — no hay nada que predecir.",
    notEnoughDeals: "Todavía no hay suficientes deals cerrados en esta cuenta para predecir un ciclo.",
    noSimilar: "No encontramos deals cerrados lo bastante parecidos todavía.",
  },
  en: {
    basisTypeIndustry: "similar closed deals by signal type and industry",
    basisType: "similar closed deals by signal type",
    basisIndustry: "similar closed deals by industry",
    basisAll: "every closed deal in the account",
    notEnoughSignalCohort:
      "Not enough closed deals with and without a new market signal during the cycle to compare yet.",
    alreadyClosed: "This opportunity is already closed — nothing left to predict.",
    notEnoughDeals: "Not enough closed deals in this account yet to predict a cycle.",
    noSimilar: "No closed deals similar enough yet.",
  },
} as const;
const copy = () => COPY[getClientLocale()];

function bestCohort(
  deals: ClosedDeal[],
  signalType: string | null,
  industry: string | null,
): { cohort: ClosedDeal[]; basis: string } | null {
  const tiers: { cohort: ClosedDeal[]; basis: string }[] = [];
  if (signalType && industry) {
    tiers.push({
      cohort: deals.filter((d) => d.signalType === signalType && d.industry === industry),
      basis: copy().basisTypeIndustry,
    });
  }
  if (signalType) {
    tiers.push({
      cohort: deals.filter((d) => d.signalType === signalType),
      basis: copy().basisType,
    });
  }
  if (industry) {
    tiers.push({
      cohort: deals.filter((d) => d.industry === industry),
      basis: copy().basisIndustry,
    });
  }
  tiers.push({ cohort: deals, basis: copy().basisAll });

  return tiers.find((t) => t.cohort.length >= MIN_COHORT) ?? null;
}

/** See CyclePredictorService._signal_recalibration's docstring (backend) —
 * this mirrors it exactly: split the same cohort into deals whose company
 * got a NEW signal (not the one that originated the opportunity) between
 * open and close, vs. deals that didn't, and compare medians. Only called
 * for the cohort already selected for the base prediction. */
function signalRecalibration(
  cohort: ClosedDeal[],
  target: Opportunity,
  signals: Signal[],
): CycleSignalRecalibration {
  const byCompany = new Map<string, Signal[]>();
  for (const s of signals) {
    if (!s.company_id) continue;
    const list = byCompany.get(s.company_id) ?? [];
    list.push(s);
    byCompany.set(s.company_id, list);
  }

  const withGroup: number[] = [];
  const withoutGroup: number[] = [];
  for (const deal of cohort) {
    const o = deal.opportunity;
    if (!o.company_id || !o.closed_at) continue; // can't check without a company + close date
    const createdAt = new Date(o.created_at).getTime();
    const closedAt = new Date(o.closed_at).getTime();
    const hasNewSignal = (byCompany.get(o.company_id) ?? []).some((s) => {
      if (s.id === o.signal_id) return false; // the originating signal isn't a "new" one
      const detectedAt = new Date(s.detected_at).getTime();
      return detectedAt > createdAt && detectedAt <= closedAt;
    });
    (hasNewSignal ? withGroup : withoutGroup).push(deal.cycleDays);
  }

  let targetHasNewSignal = false;
  let targetNewSignalTypes: string[] = [];
  if (target.company_id) {
    const createdAt = new Date(target.created_at).getTime();
    const now = Date.now();
    const newSignals = (byCompany.get(target.company_id) ?? []).filter((s) => {
      if (s.id === target.signal_id) return false;
      const detectedAt = new Date(s.detected_at).getTime();
      return detectedAt > createdAt && detectedAt <= now;
    });
    targetHasNewSignal = newSignals.length > 0;
    targetNewSignalTypes = [...new Set(newSignals.map((s) => s.signal_type))].sort();
  }

  if (withGroup.length < MIN_SIGNAL_COHORT || withoutGroup.length < MIN_SIGNAL_COHORT) {
    return {
      available: false,
      reason: copy().notEnoughSignalCohort,
      with_signal_median_days: null,
      with_signal_count: withGroup.length,
      without_signal_median_days: null,
      without_signal_count: withoutGroup.length,
      delta_days: null,
      target_has_new_signal: targetHasNewSignal,
      target_new_signal_types: targetNewSignalTypes,
    };
  }

  const withMedian = median(withGroup);
  const withoutMedian = median(withoutGroup);
  return {
    available: true,
    reason: null,
    with_signal_median_days: Math.round(withMedian * 10) / 10,
    with_signal_count: withGroup.length,
    without_signal_median_days: Math.round(withoutMedian * 10) / 10,
    without_signal_count: withoutGroup.length,
    delta_days: Math.round((withMedian - withoutMedian) * 10) / 10,
    target_has_new_signal: targetHasNewSignal,
    target_new_signal_types: targetNewSignalTypes,
  };
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
  signal_recalibration: null,
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
    return NOT_AVAILABLE(copy().alreadyClosed);
  }

  const deals = closedDeals(opportunities, signals, battlecards);
  if (deals.length < MIN_COHORT) {
    return NOT_AVAILABLE(copy().notEnoughDeals);
  }

  const targetSignalType = signalTypeFor(target, signals);
  const targetIndustry = industryFor(target, battlecards);

  const best = bestCohort(deals, targetSignalType, targetIndustry);
  if (!best) {
    return NOT_AVAILABLE(copy().noSimilar);
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
    signal_recalibration: signalRecalibration(best.cohort, target, signals),
  };
}
