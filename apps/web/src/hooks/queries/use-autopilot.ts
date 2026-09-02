"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAutopilotConfig,
  updateAutopilotConfig,
  type AutopilotConfigIn,
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
