"use client";

import { Leaderboard } from "@/features/dashboard/leaderboard";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { TeamOut, UserOut } from "@/types/auth";

/** The Ranking moved here from Resumen (which is a summary of today, not a
 *  scoreboard): won deals per rep, filterable by team, next to the quotas
 *  those numbers count against. */
export function TeamLeaderboardSection({ users, teams }: { users: UserOut[]; teams: TeamOut[] }) {
  const { data: oppsResult } = useOpportunities(undefined, 700);
  return <Leaderboard opportunities={oppsResult?.data ?? []} users={users} teams={teams} />;
}
