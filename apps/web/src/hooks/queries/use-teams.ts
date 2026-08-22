"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTeam, fetchTeams } from "@/lib/api/teams";
import { queryKeys } from "@/lib/query-keys";
import type { TeamCreateIn } from "@/types/auth";

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
