"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchBattlecards,
  fetchOpportunities,
  updateOpportunity,
  type OpportunityUpdateIn,
} from "@/lib/api/opportunities";
import { queryKeys } from "@/lib/query-keys";
import type { OpportunityStatus } from "@/types/domain";

export function useOpportunities(status?: OpportunityStatus, limit = 50) {
  return useQuery({
    queryKey: queryKeys.opportunities.list(status),
    queryFn: async () => fetchOpportunities(status, limit),
  });
}

export function useBattlecards() {
  return useQuery({
    queryKey: queryKeys.battlecards.ready(),
    queryFn: async () => fetchBattlecards(),
  });
}

export function useUpdateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OpportunityUpdateIn }) =>
      updateOpportunity(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}
