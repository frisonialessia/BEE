import { SALES, mix } from "@/components/charts/palette";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "@/types/domain";

/**
 * One BEE tone per stage — the board's own (features/crm/crm-board.tsx):
 * light honey for what BEE detects, honey when the play is ready, lilac for
 * the team's priority, indigo for a conversation already open, the sales
 * green for a won client. The panel and the board never disagree on what a
 * color means.
 */
export const STAGE_ACCENT: Record<CrmStage | "closed", string> = {
  detected: "var(--color-chart-3)",
  ready_to_action: "var(--color-chart-1)",
  prioritized: "var(--color-chart-6)",
  in_progress: "var(--color-chart-4)",
  closed: SALES.won,
};

/** A lost or dismissed deal closes in ink, never a red. */
export const LOST_FILL = mix("var(--color-text)", 18);

export type StepKey = CrmStage | "closed";

/** Stepper order: the four open stages, then Cerradas. */
export const STEP_ORDER: StepKey[] = [...CRM_STAGES.map((s) => s.id), "closed"];

export function stepOf(status: OpportunityStatus): StepKey {
  return CLOSED_OPPORTUNITY_STATUSES.includes(status) ? "closed" : (status as CrmStage);
}

export function isClosedStatus(status: OpportunityStatus): boolean {
  return CLOSED_OPPORTUNITY_STATUSES.includes(status);
}

/** The single hue the panel accents from — the stage's color while the
 *  deal is open, green once it is won, ink for a lost/dismissed one. */
export function accentOf(opportunity: Pick<Opportunity, "status">): string {
  if (opportunity.status === "won") return STAGE_ACCENT.closed;
  if (isClosedStatus(opportunity.status)) return LOST_FILL;
  return STAGE_ACCENT[opportunity.status as CrmStage];
}
