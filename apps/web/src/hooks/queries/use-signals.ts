"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSignals } from "@/lib/api/signals";
import { queryKeys } from "@/lib/query-keys";

export function useSignals(limit = 50) {
  return useQuery({
    queryKey: queryKeys.signals.list(limit),
    queryFn: async () => fetchSignals(limit),
  });
}
