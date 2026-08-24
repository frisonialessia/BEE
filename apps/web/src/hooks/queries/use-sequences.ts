"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSequence,
  fetchSequence,
  fetchSequences,
  startSequenceExecution,
  type SequenceCreateIn,
} from "@/lib/api/sequences";
import { getChannelStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useSequences(limit = 50) {
  return useQuery({
    queryKey: queryKeys.sequences.list(),
    queryFn: async () => fetchSequences(limit),
  });
}

export function useSequence(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sequences.detail(id ?? ""),
    queryFn: async () => fetchSequence(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SequenceCreateIn) => createSequence(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all });
    },
  });
}

export function useStartSequenceExecution() {
  return useMutation({
    mutationFn: (body: { sequence_id: string; lead_id?: string; opportunity_id?: string }) =>
      startSequenceExecution(body),
  });
}

/** Estado real de autenticación por canal (LinkedIn/Email/X) — mock vs
 *  conectado, directo desde OmnichannelGateway.check_auth(). Nunca se
 *  inventa "conectado" en la UI del builder: este mismo dato es el que ya
 *  usa Voz de marca para el mismo propósito. */
export function useChannelStatus() {
  return useQuery({
    queryKey: queryKeys.sequences.channelStatus(),
    queryFn: async () => getChannelStatus(),
  });
}
