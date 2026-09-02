import { apiFetch } from "@/lib/api/client";
import { demoFetchTeams } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
import { ApiError } from "@/types/api";
import type { TeamCreateIn, TeamOut, TeamProfileIn, TeamProfileOut } from "@/types/auth";

export async function fetchTeams(): Promise<TeamOut[]> {
  if (isDemoMode()) return demoFetchTeams();
  return apiFetch<TeamOut[]>("/api/v1/teams", { cache: "no-store" });
}

export async function createTeam(body: TeamCreateIn): Promise<TeamOut> {
  return apiFetch<TeamOut>("/api/v1/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Returns null instead of throwing when the team has no profile set yet —
 * a normal state (every team starts unconfigured), not an error. */
export async function fetchTeamProfile(teamId: string): Promise<TeamProfileOut | null> {
  try {
    return await apiFetch<TeamProfileOut>(`/api/v1/teams/${teamId}/profile`, { cache: "no-store" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function setTeamProfile(teamId: string, body: TeamProfileIn): Promise<TeamProfileOut> {
  return apiFetch<TeamProfileOut>(`/api/v1/teams/${teamId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
