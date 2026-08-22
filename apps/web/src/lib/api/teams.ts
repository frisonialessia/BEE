import { apiFetch } from "@/lib/api/client";
import type { TeamCreateIn, TeamOut } from "@/types/auth";

export async function fetchTeams(): Promise<TeamOut[]> {
  return apiFetch<TeamOut[]>("/api/v1/teams", { cache: "no-store" });
}

export async function createTeam(body: TeamCreateIn): Promise<TeamOut> {
  return apiFetch<TeamOut>("/api/v1/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
