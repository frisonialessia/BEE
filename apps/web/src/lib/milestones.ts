/**
 * Round-number milestones for the team's real total of won deals — the
 * base sequence covers the early, more granular numbers a young team
 * actually crosses one at a time; past 5000 it just keeps adding 2500
 * forever, so the sequence has no hard end no matter how large a team's
 * history grows. Shared by the milestone-crossed celebration
 * (use-milestone-celebration.ts) and the infinite path card
 * (milestone-path-card.tsx), so the two always agree on what a "level" is.
 */
const BASE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

export function milestoneAt(index: number): number {
  if (index < BASE_MILESTONES.length) return BASE_MILESTONES[index];
  return 5000 + (index - BASE_MILESTONES.length + 1) * 2500;
}

/** The index of the smallest milestone >= total — "the next one to reach",
 * or the one just reached if total lands exactly on it. */
export function currentMilestoneIndex(total: number): number {
  let i = 0;
  while (milestoneAt(i) < total) i++;
  return i;
}
