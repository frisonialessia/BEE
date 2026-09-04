import { SALES, mix } from "@/components/charts/palette";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "@/types/domain";

/**
 * One BEE tone per stage — a verbatim copy of `STAGE_ACCENT` in
 * `features/crm/crm-board.tsx` so a stage looks the same on the board and
 * inside the drawer. Honey for what BEE detects (new, ready), lilac and
 * indigo for what the team works (priority, conversation). Closed is the
 * one place with a sales green, and only for a WON deal.
 */
export const STAGE_ACCENT: Record<CrmStage | "closed", string> = {
  detected: "var(--color-chart-3)",
  ready_to_action: "var(--color-chart-1)",
  prioritized: "var(--color-chart-6)",
  in_progress: "var(--color-chart-4)",
  closed: SALES.won,
};

export type StepKey = CrmStage | "closed";

/** Stepper order: the four open stages, then Cerradas. */
export const STEP_ORDER: StepKey[] = [...CRM_STAGES.map((s) => s.id), "closed"];

export function stepOf(status: OpportunityStatus): StepKey {
  return CLOSED_OPPORTUNITY_STATUSES.includes(status) ? "closed" : (status as CrmStage);
}

export function isClosedStatus(status: OpportunityStatus): boolean {
  return CLOSED_OPPORTUNITY_STATUSES.includes(status);
}

/** The single hue every block in the drawer mixes from — the stage's
 *  color while the deal is open, the sales green once it is won, and plain
 *  ink for a lost/dismissed one (never a red). */
export function accentOf(opportunity: Pick<Opportunity, "status">): string {
  if (opportunity.status === "won") return SALES.won;
  if (isClosedStatus(opportunity.status)) return "var(--color-text)";
  return STAGE_ACCENT[opportunity.status as CrmStage];
}

/** Tints of the block hue: chips, discs and meters share one color at
 *  different strengths (BEE's "one color per block"). */
export const tint = {
  wash: (hue: string) => mix(hue, 12),
  soft: (hue: string) => mix(hue, 22),
  chip: (hue: string) => mix(hue, 32),
  strong: (hue: string) => mix(hue, 55),
};
