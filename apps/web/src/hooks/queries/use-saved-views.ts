"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createSavedView, deleteSavedView, fetchSavedViews, type SavedViewCreateIn } from "@/lib/api/saved-views";
import { queryKeys } from "@/lib/query-keys";

export function useSavedViews(page: string) {
  return useQuery({
    queryKey: queryKeys.savedViews.list(page),
    queryFn: async () => fetchSavedViews(page),
  });
}

export function useCreateSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SavedViewCreateIn) => createSavedView(body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedViews.list(variables.page) });
    },
  });
}

export function useDeleteSavedView(page: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedViews.list(page) });
    },
  });
}
