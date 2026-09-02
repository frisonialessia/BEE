"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTeam, fetchTeamProfile, fetchTeams, setTeamProfile } from "@/lib/api/teams";
import { queryKeys } from "@/lib/query-keys";
import type { TeamCreateIn, TeamProfileIn } from "@/types/auth";

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: fetchTeams,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamCreateIn) => createTeam(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useTeamProfile(teamId: string) {
  return useQuery({
    queryKey: queryKeys.teams.profile(teamId),
    queryFn: () => fetchTeamProfile(teamId),
    enabled: Boolean(teamId),
  });
}

export function useSetTeamProfile(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamProfileIn) => setTeamProfile(teamId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.profile(teamId) });
    },
  });
}
