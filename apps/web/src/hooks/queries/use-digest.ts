"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchDigestSettings, sendDigestNow, updateDigestSettings } from "@/lib/api/digest";
import type { DigestSettingsIn } from "@/lib/api/digest";

const KEY = ["organization", "digest"] as const;

export function useDigestSettings() {
  return useQuery({ queryKey: KEY, queryFn: fetchDigestSettings });
}

export function useUpdateDigestSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DigestSettingsIn) => updateDigestSettings(body),
    onSuccess: (settings) => {
      queryClient.setQueryData(KEY, settings);
    },
  });
}

export function useSendDigestNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendDigestNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
