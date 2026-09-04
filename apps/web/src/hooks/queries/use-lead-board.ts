"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getDarkFunnelHotLeads, setHotLeadTemperature } from "@/lib/api";
import { fetchOpportunities } from "@/lib/api/opportunities";
import { opportunityToLeadCard } from "@/lib/control/lead-board";
import { queryKeys } from "@/lib/query-keys";
import type { FetchResult } from "@/types/api";
import type { LeadCard } from "@/types/control";
import type { HotLeadScore } from "@/types/extended";

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

/**
 * A person cools or heats an account from the hive. Optimistic: the cell
 * moves as soon as the dot is pressed, every hive query patched at once;
 * a failed request puts the previous temperatures back.
 */
export function useSetHiveTemperature() {
  const queryClient = useQueryClient();
  const key = [...queryKeys.control.all, "hive-leads"] as const;
  return useMutation({
    mutationFn: ({ id, temperature }: { id: string; temperature: number | null }) => setHotLeadTemperature(id, temperature),
    onMutate: async ({ id, temperature }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueriesData<FetchResult<HotLeadScore[]>>({ queryKey: key });
      queryClient.setQueriesData<FetchResult<HotLeadScore[]>>({ queryKey: key }, (old) =>
        old && { ...old, data: old.data.map((l) => (l.id === id ? { ...l, manual_temperature: temperature } : l)) },
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      for (const [k, data] of ctx?.previous ?? []) queryClient.setQueryData(k, data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
