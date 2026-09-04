"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAuditDecisions,
  getAuditSummary,
  getDLQEvents,
  getDLQSummary,
  resolveDLQEvent,
  retryDLQEvent,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Resiliencia data — the failed-event queue (DLQ) and the agent audit log.
 * TanStack Query instead of per-panel useEffect/useState so the headline
 * tiles on the Resiliencia tab and the panels below them share one fetch
 * (the query client dedupes identical keys) and a retry/resolve in one
 * place refreshes every box that shows that number.
 */
export function useDlqSummary() {
  return useQuery({
    queryKey: queryKeys.workflow.dlq.summary(),
    queryFn: async () => getDLQSummary(),
    refetchInterval: 30_000,
  });
}

export function useDlqEvents(limit = 30) {
  return useQuery({
    queryKey: queryKeys.workflow.dlq.events(limit),
    queryFn: async () => getDLQEvents({ limit }),
    refetchInterval: 30_000,
  });
}

export function useRetryDlqEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryDLQEvent(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflow.dlq.all });
    },
  });
}

export function useResolveDlqEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => resolveDLQEvent(id, notes),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflow.dlq.all });
    },
  });
}

export function useAuditSummary() {
  return useQuery({
    queryKey: queryKeys.auditDecisions.summary(),
    queryFn: async () => getAuditSummary(),
  });
}

export function useAuditDecisions(reviewOnly: boolean, { limit = 30, enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.auditDecisions.list(reviewOnly, limit),
    queryFn: async () =>
      getAuditDecisions({ limit, manual_review_required: reviewOnly || undefined }),
    enabled,
  });
}
