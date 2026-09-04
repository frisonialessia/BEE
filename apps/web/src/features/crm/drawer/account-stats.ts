import { mix } from "@/components/charts/palette";
import type { BarPoint } from "@/components/charts/bars-vs-target";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import type { Opportunity } from "@/types/domain";

import { STAGE_ACCENT, STEP_ORDER, stepOf, type StepKey } from "./stage-meta";

export const MONTHS_BACK = 6;

/** Segment color per step of the account bar — the stage's tone; won is
 *  the one green, lost/dismissed a neutral ink. */
export function segmentFill(step: StepKey, opps: Pick<Opportunity, "status">[]): string {
  if (step !== "closed") return STAGE_ACCENT[step];
  return opps.some((o) => o.status === "won") ? STAGE_ACCENT.closed : mix("var(--color-text)", 20);
}

/** How many of the account's opportunities sit in each step. */
export function countByStep(opps: Pick<Opportunity, "status">[]): Record<StepKey, number> {
  const counts = Object.fromEntries(STEP_ORDER.map((s) => [s, 0])) as Record<StepKey, number>;
  for (const o of opps) counts[stepOf(o.status)] += 1;
  return counts;
}

/** Amount created per month over the last MONTHS_BACK months; the last
 *  point is the current month. */
export function monthlyAmounts(opps: Pick<Opportunity, "created_at" | "amount">[], locale: Locale): BarPoint[] {
  const fmt = new Intl.DateTimeFormat(localeTags[locale], { month: "short" });
  const now = new Date();
  const points: BarPoint[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const value = opps.reduce((sum, o) => {
      const c = new Date(o.created_at);
      return `${c.getFullYear()}-${c.getMonth()}` === key ? sum + (o.amount ?? 0) : sum;
    }, 0);
    points.push({ label: fmt.format(d), value, current: i === 0 });
  }
  return points;
}
