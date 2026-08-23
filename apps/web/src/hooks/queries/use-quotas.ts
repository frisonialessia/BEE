"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createQuota, deleteQuota, fetchQuotas, type QuotaCreateIn } from "@/lib/api/quotas";
import { queryKeys } from "@/lib/query-keys";

export function useQuotas() {
  return useQuery({
    queryKey: queryKeys.quotas.list(),
    queryFn: async () => fetchQuotas(),
  });
}

export function useCreateQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: QuotaCreateIn) => createQuota(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotas.all });
    },
  });
}

export function useDeleteQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteQuota(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotas.all });
    },
  });
}
