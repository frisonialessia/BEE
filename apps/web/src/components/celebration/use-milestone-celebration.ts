"use client";

import { useEffect } from "react";

import { useCelebrateMilestone } from "@/components/celebration/celebration-toast";

const STORAGE_KEY = "bee_milestone_seen_total_v1";
// Round numbers, not a rate — a milestone is a fact about the team's own
// history, so the list stays wide once the totals get large.
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

/**
 * Celebrates the team's own total of won deals crossing one of the round
 * numbers above — once. The first time this ever runs in a browser there
 * is no known baseline, so it just records the current total instead of
 * guessing whether today is the day it was crossed; only a total that
 * grows past a milestone *after* a baseline is known fires the toast.
 */
export function useMilestoneCelebration(totalWon: number) {
  const celebrateMilestone = useCelebrateMilestone();

  useEffect(() => {
    if (totalWon <= 0) return;
    let stored: number | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      stored = raw === null ? null : Number(raw);
    } catch {
      // localStorage unavailable — skip the celebration, not the page.
      return;
    }
    if (stored !== null && Number.isFinite(stored)) {
      const reached = MILESTONES.filter((m) => m > stored! && m <= totalWon);
      if (reached.length > 0) celebrateMilestone(reached[reached.length - 1]);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(totalWon));
    } catch {
      // Same as above.
    }
  }, [totalWon, celebrateMilestone]);
}
