"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAutopilotConfig,
  simulateAutopilotConfig,
  updateAutopilotConfig,
  type AutopilotConfigIn,
  type AutopilotSimulationRequest,
} from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";

export function useAutopilotConfig() {
  return useQuery({
    queryKey: queryKeys.autopilot.config(),
    queryFn: fetchAutopilotConfig,
  });
}

export function useUpdateAutopilotConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AutopilotConfigIn) => updateAutopilotConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autopilot.all });
    },
  });
}

/** Read-only backtest — no query key to invalidate, no persisted state.
 * A plain mutation (not a query) because it's fired on demand against
 * whatever candidate values are currently in the editor, not cached by
 * input — the same shape as any other "run this on click" action. */
export function useSimulateAutopilotConfig() {
  return useMutation({
    mutationFn: (body: AutopilotSimulationRequest) => simulateAutopilotConfig(body),
  });
}
