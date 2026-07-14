"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { approveAction, getPendingActions, rejectAction } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function usePendingActions(limit = 20) {
  return useQuery({
    queryKey: queryKeys.orchestrator.pending(limit),
    queryFn: async () => getPendingActions(limit),
    refetchInterval: 30_000,
  });
}

export function useApproveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
      approveAction(id, approvedBy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orchestrator"] });
    },
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectAction(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orchestrator"] });
    },
  });
}
