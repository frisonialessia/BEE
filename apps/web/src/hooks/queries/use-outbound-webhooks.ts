"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOutboundWebhook,
  deleteOutboundWebhook,
  fetchOutboundWebhookEventTypes,
  fetchOutboundWebhooks,
  updateOutboundWebhook,
  type OutboundWebhookCreateIn,
  type OutboundWebhookUpdateIn,
} from "@/lib/api/outbound-webhooks";
import { queryKeys } from "@/lib/query-keys";

export function useOutboundWebhooks() {
  return useQuery({
    queryKey: queryKeys.outboundWebhooks.list(),
    queryFn: async () => fetchOutboundWebhooks(),
  });
}

export function useOutboundWebhookEventTypes() {
  return useQuery({
    queryKey: queryKeys.outboundWebhooks.eventTypes(),
    queryFn: async () => fetchOutboundWebhookEventTypes(),
    staleTime: Infinity, // fixed catalog, not worth refetching
  });
}

export function useCreateOutboundWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OutboundWebhookCreateIn) => createOutboundWebhook(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.outboundWebhooks.all });
    },
  });
}

export function useUpdateOutboundWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OutboundWebhookUpdateIn }) =>
      updateOutboundWebhook(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.outboundWebhooks.all });
    },
  });
}

export function useDeleteOutboundWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOutboundWebhook(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.outboundWebhooks.all });
    },
  });
}
