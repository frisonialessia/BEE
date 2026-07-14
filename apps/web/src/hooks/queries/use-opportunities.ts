"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchBattlecards, fetchOpportunities } from "@/lib/api/opportunities";
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
