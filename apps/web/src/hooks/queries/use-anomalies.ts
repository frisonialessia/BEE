"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { acknowledgeAnomaly } from "@/lib/api";
import { fetchOpenAnomalies } from "@/lib/api/anomalies";
import { queryKeys } from "@/lib/query-keys";

export function useOpenAnomalies() {
  return useQuery({
    queryKey: queryKeys.anomalies.open(),
    queryFn: async () => fetchOpenAnomalies(),
  });
}

/** Marks an alert reviewed — the one action Control's anomaly rows offer.
 *  Invalidates the whole anomalies family so Voz de marca's monitor (same
 *  key prefix, own suffix) refreshes too. */
export function useAcknowledgeAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeAnomaly(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anomalies.all });
    },
  });
}
