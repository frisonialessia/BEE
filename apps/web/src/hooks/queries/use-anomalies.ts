"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchOpenAnomalies } from "@/lib/api/anomalies";
import { queryKeys } from "@/lib/query-keys";

export function useOpenAnomalies() {
  return useQuery({
    queryKey: queryKeys.anomalies.open(),
    queryFn: async () => fetchOpenAnomalies(),
  });
}
