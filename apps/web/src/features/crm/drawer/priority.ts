import { DATA } from "@/components/charts/palette";

/**
 * Priority as three steps on BEE's 0–100 score, each with its own dot
 * color (lavender · honey · magenta — the same three-dot row the calendar
 * dialog uses for a meeting's color). A preset signal keeps its exact
 * score; a click snaps to the step's center.
 */
export const PRIORITY_STEPS = [
  { key: "low", score: 25, max: 40, color: DATA.lavender },
  { key: "mid", score: 50, max: 70, color: DATA.honeyFill },
  { key: "high", score: 80, max: 101, color: DATA.magenta },
] as const;

export type PriorityKey = (typeof PRIORITY_STEPS)[number]["key"];

export function priorityOf(score: number): (typeof PRIORITY_STEPS)[number] {
  return PRIORITY_STEPS.find((s) => score < s.max) ?? PRIORITY_STEPS[PRIORITY_STEPS.length - 1];
}
