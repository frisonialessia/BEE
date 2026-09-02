import { stripOpportunityTitlePrefix } from "@/lib/format";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity } from "@/types/domain";
import type { HotLeadScore } from "@/types/extended";
import type { LeadCard, LeadColumnId } from "@/types/control";

export const KANBAN_COLUMNS: Array<{ id: LeadColumnId; label: string }> = [
  { id: "detected", label: "Detected" },
  { id: "enriching", label: "Enriching" },
  { id: "ready_to_action", label: "Ready" },
  { id: "in_progress", label: "In Progress" },
  { id: "closed", label: "Closed" },
];

function isBattlecardComplete(strategy: Opportunity["strategy"]): boolean {
  return Boolean(strategy?.pain_point && strategy?.closing_argument);
}

export function opportunityToColumn(opp: Opportunity): LeadColumnId {
  if (CLOSED_OPPORTUNITY_STATUSES.includes(opp.status)) {
    return "closed";
  }
  if (opp.status === "in_progress" || opp.status === "prioritized") {
    return "in_progress";
  }
  if (opp.status === "ready_to_action") {
    return "ready_to_action";
  }
  if (opp.status === "detected" && !isBattlecardComplete(opp.strategy)) {
    return "enriching";
  }
  return "detected";
}

export function opportunityToLeadCard(opp: Opportunity): LeadCard {
  const strategy = opp.strategy;
  return {
    opportunity_id: opp.id,
    signal_id: opp.signal_id,
    title: stripOpportunityTitlePrefix(opp.title),
    company_name: null,
    lead_name: null,
    score: opp.score,
    status: opp.status,
    column: opportunityToColumn(opp),
    strategy: strategy ?? null,
    hot_lead: Boolean((strategy as Record<string, unknown> | undefined)?.hot_lead),
    manual_review_required: Boolean(strategy?.manual_review_required),
    updated_at: new Date().toISOString(),
  };
}

export function groupLeadCards(cards: LeadCard[]): Record<LeadColumnId, LeadCard[]> {
  const groups = Object.fromEntries(
    KANBAN_COLUMNS.map((c) => [c.id, [] as LeadCard[]]),
  ) as Record<LeadColumnId, LeadCard[]>;

  for (const card of cards) {
    groups[card.column].push(card);
  }

  for (const col of KANBAN_COLUMNS) {
    groups[col.id].sort((a, b) => b.score - a.score);
  }

  return groups;
}

/** Stable hash for positioning leads in the hex map. */
export function hashDomain(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) {
    h = (h << 5) - h + domain.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export type { HotLeadScore };
