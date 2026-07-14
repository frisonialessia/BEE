"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { recordOutcome } from "@/lib/api/opportunities";
import { queryKeys } from "@/lib/query-keys";
import type { OutcomeIn } from "@/types/domain";

export function useRecordOutcome(opportunityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: OutcomeIn) => recordOutcome(opportunityId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.battlecards.all });
    },
  });
}
