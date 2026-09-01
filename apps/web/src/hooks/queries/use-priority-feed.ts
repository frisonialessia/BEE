"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dismissFromTodayFeed, getTodayFeed } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Today's ranked decisions — refetched every 5 minutes, same "stays fresh
 *  without a manual reload but doesn't hammer the fusion query" cadence
 *  as other dashboard-level polling hooks. */
export function useTodayFeed() {
  return useQuery({
    queryKey: queryKeys.priorityFeed.today(),
    queryFn: async () => getTodayFeed(),
    refetchInterval: 5 * 60_000,
  });
}

export function useDismissFromFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) => dismissFromTodayFeed(opportunityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.priorityFeed.all });
    },
  });
}
