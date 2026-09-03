"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchMarketSources } from "@/lib/api/market-sources";

export function useMarketSources() {
  return useQuery({
    queryKey: ["market-sources"] as const,
    queryFn: fetchMarketSources,
    staleTime: 10 * 60_000,
  });
}
