"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchFederatedIntelligenceConfig,
  updateFederatedIntelligenceConfig,
  type FederatedIntelligenceConfig,
} from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";

export function useFederatedIntelligenceConfig() {
  return useQuery({
    queryKey: queryKeys.federatedIntelligence.config(),
    queryFn: fetchFederatedIntelligenceConfig,
  });
}

export function useUpdateFederatedIntelligenceConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FederatedIntelligenceConfig) => updateFederatedIntelligenceConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.federatedIntelligence.all });
    },
  });
}
