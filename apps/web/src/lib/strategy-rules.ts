import type { SignalType, TimingUrgency } from "@/types/domain";

/**
 * Mirror of the backend's rule-based strategy generators
 * (apps/api/app/services/strategy_generator/rule_based.py) — which
 * playbook, first action, channel and urgency each signal type gets when
 * no LLM is configured. Same convention as lib/icp.ts's port of
 * fit_score.py: keep in lock-step, never let the sandbox show a strategy
 * the real engine would not produce.
 */
export interface RuleBasedStrategy {
  playbook: string;
  next_best_action: "reach_out" | "research" | "monitor";
  channel: "email" | "linkedin";
  urgency: TimingUrgency;
}

export function ruleBasedStrategyFor(signalType: SignalType, score: number): RuleBasedStrategy {
  switch (signalType) {
    case "funding_round":
      // FundingRoundGenerator: Series B/C (score ≥ 85) → email, else LinkedIn.
      return { playbook: "post_funding_outreach", next_best_action: "reach_out", channel: score >= 85 ? "email" : "linkedin", urgency: "immediate" };
    case "leadership_change":
      return { playbook: "leadership_change_outreach", next_best_action: "reach_out", channel: "linkedin", urgency: "this_week" };
    case "hiring":
      // Hiring without a leadership change is a watch signal, not an outreach.
      return { playbook: "hiring_growth_outreach", next_best_action: "monitor", channel: "linkedin", urgency: "this_month" };
    case "tech_adoption":
      return { playbook: "complementary_tech_pitch", next_best_action: "research", channel: "email", urgency: "this_month" };
    case "expansion":
      return { playbook: "expansion_upsell_outreach", next_best_action: "reach_out", channel: "email", urgency: "this_week" };
    case "franchise_expansion":
      return { playbook: "franchise_expansion_outreach", next_best_action: "reach_out", channel: "email", urgency: "this_month" };
    case "merger_acquisition":
      return { playbook: "post_merger_consolidation_outreach", next_best_action: "reach_out", channel: "email", urgency: "this_week" };
    case "public_tender":
      return { playbook: "public_tender_outreach", next_best_action: "reach_out", channel: "email", urgency: "this_week" };
    case "regulatory_change":
      return { playbook: "regulatory_compliance_outreach", next_best_action: "research", channel: "email", urgency: "this_month" };
    case "funding_grant":
      return { playbook: "funding_grant_outreach", next_best_action: "reach_out", channel: "email", urgency: "this_month" };
    default:
      // GenericStrategyGenerator: product_launch, engagement, news_mention, other.
      return { playbook: "generic_outreach", next_best_action: "monitor", channel: "email", urgency: "watch" };
  }
}
