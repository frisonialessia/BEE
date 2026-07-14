"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSystemHealth } from "@/lib/api/control";
import { queryKeys } from "@/lib/query-keys";

/** Polls backend health every 10s — proactive updates without manual refresh. */
export function useSystemHealth(pollMs = 10_000) {
  return useQuery({
    queryKey: queryKeys.control.systemHealth(),
    queryFn: async () => fetchSystemHealth(),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
}
