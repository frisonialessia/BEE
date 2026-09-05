"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteAssistantConversation, fetchAssistantConversations } from "@/lib/api/assistant";
import { queryKeys } from "@/lib/query-keys";

/** Only worth asking when the copilot is actually the one answering — see
 *  lib/api/assistant.ts's module docstring for why. Callers pass
 *  `engine === "copilot"` as `enabled`. */
export function useAssistantConversations(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.assistantConversations.list(),
    queryFn: fetchAssistantConversations,
    enabled,
    staleTime: 30_000,
  });
}

export function useDeleteAssistantConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => deleteAssistantConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assistantConversations.all });
    },
  });
}
