"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createOrgApiKey, fetchOrgApiKeys, revokeOrgApiKey } from "@/lib/api/org-api-keys";
import { queryKeys } from "@/lib/query-keys";

export function useOrgApiKeys() {
  return useQuery({
    queryKey: queryKeys.orgApiKeys.list(),
    queryFn: fetchOrgApiKeys,
  });
}

export function useCreateOrgApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createOrgApiKey(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgApiKeys.all });
    },
  });
}

export function useRevokeOrgApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeOrgApiKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgApiKeys.all });
    },
  });
}
