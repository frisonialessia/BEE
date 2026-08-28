"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchArtifacts, fetchBattlecard, fetchCyclePrediction } from "@/lib/api/opportunities";
import { queryKeys } from "@/lib/query-keys";

export function useBattlecard(opportunityId: string) {
  return useQuery({
    queryKey: queryKeys.opportunities.battlecard(opportunityId),
    queryFn: async () => fetchBattlecard(opportunityId),
    enabled: Boolean(opportunityId),
  });
}

export function useCyclePrediction(opportunityId: string) {
  return useQuery({
    queryKey: queryKeys.opportunities.cyclePrediction(opportunityId),
    queryFn: async () => fetchCyclePrediction(opportunityId),
    enabled: Boolean(opportunityId),
  });
}

export function useArtifacts(opportunityId: string, force = false) {
  return useQuery({
    queryKey: [...queryKeys.opportunities.artifacts(opportunityId), force],
    queryFn: async () => fetchArtifacts(opportunityId, force),
    enabled: Boolean(opportunityId),
  });
}
