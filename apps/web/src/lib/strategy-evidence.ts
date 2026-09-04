import type { SuccessPattern } from "@/lib/api/feedback";
import type { Battlecard, Company, Opportunity, Signal } from "@/types/domain";

/** Under this many closed deals a cohort narrowed by industry is too thin
 *  to quote — fall back to the wider signal-type cohort. Same floor the
 *  cycle predictor uses (lib/cycle-prediction.ts MIN_COHORT). */
const MIN_INDUSTRY_COHORT = 3;

export type EvidenceBasis =
  /** FeedbackLoopService's own pattern for this signal + playbook + channel. */
  | "pattern"
  /** Closed deals of the same signal type in the same industry. */
  | "type_industry"
  /** Closed deals of the same signal type, any industry. */
  | "type"
  /** Nothing closed for this signal type yet. */
  | "none";

export interface StrategyEvidence {
  basis: EvidenceBasis;
  /** Closed deals (won + lost) the numbers come from. 0 when basis is "none". */
  sampleSize: number;
  won: number;
  /** 0–1, null when sampleSize is 0. */
  winRate: number | null;
  /** Median days from created_at to closed_at over the WON deals of the
   *  cohort (a pattern quotes its own avg_days_to_close). Null when no won
   *  deal has a close date. */
  daysToClose: number | null;
  /** Industry the cohort was narrowed to, when it was. */
  industry: string | null;
}

/** Everything the strategies page has already loaded — the evidence is a
 *  pure function of it, no extra endpoint. */
export interface EvidenceContext {
  opportunities: Opportunity[];
  signals: Signal[];
  companies: Company[];
  patterns: SuccessPattern[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function cycleDays(o: Opportunity): number | null {
  if (!o.closed_at) return null;
  const days = (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86_400_000;
  return days < 0 ? null : days;
}

/**
 * The one evidence line behind a battlecard: how deals born from THIS kind
 * of signal actually closed in this account. Order of preference —
 *   1. the backend's success pattern for the exact signal + playbook +
 *      channel the card recommends (already floor-filtered server-side);
 *   2. closed deals of the same signal type in the same industry (≥ 3);
 *   3. closed deals of the same signal type, any industry;
 *   4. honest "no history" when nothing closed yet.
 * Never invents a number: every figure is a count over loaded rows.
 */
export function computeStrategyEvidence(card: Battlecard, ctx: EvidenceContext): StrategyEvidence {
  const signalType = card.signal.signal_type;
  const industry = card.company.industry ?? null;

  const pattern = ctx.patterns.find(
    (p) =>
      p.signal_type === signalType &&
      p.playbook === card.strategy.playbook &&
      p.channel === card.strategy.channel &&
      p.sample_size > 0,
  );
  if (pattern) {
    return {
      basis: "pattern",
      sampleSize: pattern.sample_size,
      won: Math.round(pattern.win_rate * pattern.sample_size),
      winRate: pattern.win_rate,
      daysToClose: pattern.avg_days_to_close,
      industry: null,
    };
  }

  const signalTypeById = new Map(ctx.signals.map((s) => [s.id, s.signal_type]));
  const industryByCompany = new Map(ctx.companies.map((c) => [c.id, c.industry]));

  const closedOfType = ctx.opportunities.filter(
    (o) =>
      (o.status === "won" || o.status === "lost") &&
      o.id !== card.opportunity_id &&
      o.signal_id !== null &&
      signalTypeById.get(o.signal_id) === signalType,
  );

  let cohort = closedOfType;
  let basis: EvidenceBasis = "type";
  let cohortIndustry: string | null = null;
  if (industry) {
    const sameIndustry = closedOfType.filter(
      (o) => o.company_id !== null && industryByCompany.get(o.company_id) === industry,
    );
    if (sameIndustry.length >= MIN_INDUSTRY_COHORT) {
      cohort = sameIndustry;
      basis = "type_industry";
      cohortIndustry = industry;
    }
  }

  if (cohort.length === 0) {
    return { basis: "none", sampleSize: 0, won: 0, winRate: null, daysToClose: null, industry: null };
  }

  const won = cohort.filter((o) => o.status === "won");
  const wonCycles = won.map(cycleDays).filter((d): d is number => d !== null);
  return {
    basis,
    sampleSize: cohort.length,
    won: won.length,
    winRate: won.length / cohort.length,
    daysToClose: median(wonCycles),
    industry: cohortIndustry,
  };
}

/** Account-wide closed-deal sample the page quotes above the grid, so every
 *  per-card percentage is read against how much history it rests on. */
export function closedDealSample(opportunities: Opportunity[]): { closed: number; won: number } {
  const won = opportunities.filter((o) => o.status === "won").length;
  const lost = opportunities.filter((o) => o.status === "lost").length;
  return { closed: won + lost, won };
}
