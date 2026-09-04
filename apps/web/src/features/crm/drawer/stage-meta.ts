import { mix } from "@/components/charts/palette";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "@/types/domain";

/**
 * One BEE tone per stage inside the drawer. Honey for what BEE detects,
 * lilac for what BEE prepared, magenta for what the team flagged, and the
 * app's lavender for a conversation already open. No blue here — blue is
 * the primary button's and nothing else's — and no green: greens belong
 * to the Ventas page, so a won deal closes in the deeper honey.
 */
export const STAGE_ACCENT: Record<CrmStage | "closed", string> = {
  detected: "var(--color-chart-3)",
  ready_to_action: "var(--color-chart-6)",
  prioritized: "var(--color-chart-5)",
  in_progress: "var(--color-primary)",
  closed: "var(--color-chart-1)",
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

/** The single hue the drawer accents from — the stage's color while the
 *  deal is open, honey once it is won, ink for a lost/dismissed one. */
export function accentOf(opportunity: Pick<Opportunity, "status">): string {
  if (opportunity.status === "won") return STAGE_ACCENT.closed;
  if (isClosedStatus(opportunity.status)) return LOST_FILL;
  return STAGE_ACCENT[opportunity.status as CrmStage];
}
