"use client";

import { useEffect } from "react";

import { useCelebrateMilestone } from "@/components/celebration/celebration-toast";
import { milestoneAt } from "@/lib/milestones";

const STORAGE_KEY = "bee_milestone_seen_total_v1";

/**
 * Celebrates the team's own total of won deals crossing one of the round
 * numbers in `lib/milestones.ts` — once. The first time this ever runs in
 * a browser there is no known baseline, so it just records the current
 * total instead of guessing whether today is the day it was crossed; only
 * a total that grows past a milestone *after* a baseline is known fires
 * the toast.
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
      const reached: number[] = [];
      for (let i = 0; ; i++) {
        const m = milestoneAt(i);
        if (m > totalWon) break;
        if (m > stored) reached.push(m);
      }
      if (reached.length > 0) celebrateMilestone(reached[reached.length - 1]);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(totalWon));
    } catch {
      // Same as above.
    }
  }, [totalWon, celebrateMilestone]);
}
