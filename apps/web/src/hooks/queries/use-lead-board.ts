"use client";

import { useQuery } from "@tanstack/react-query";

import { getDarkFunnelHotLeads } from "@/lib/api";
import { fetchOpportunities } from "@/lib/api/opportunities";
import { opportunityToLeadCard } from "@/lib/control/lead-board";
import { queryKeys } from "@/lib/query-keys";
import type { LeadCard } from "@/types/control";

/** Kanban board data — polls opportunities every 12s. */
export function useLeadBoard(limit = 100) {
  return useQuery({
    queryKey: [...queryKeys.opportunities.list(undefined), "lead-board", limit],
    queryFn: async () => {
      const result = await fetchOpportunities(undefined, limit);
      const cards: LeadCard[] = result.data.map(opportunityToLeadCard);
      return { ...result, cards };
    },
    refetchInterval: 12_000,
    staleTime: 6_000,
  });
}

/** Hive heatmap data — DarkFunnel closing temperature, polls every 12s. */
export function useHiveLeads(limit = 200) {
  return useQuery({
    queryKey: queryKeys.control.hiveLeads(limit),
    queryFn: async () => getDarkFunnelHotLeads({ limit, min_score: 0 }),
    refetchInterval: 12_000,
    staleTime: 6_000,
  });
}
