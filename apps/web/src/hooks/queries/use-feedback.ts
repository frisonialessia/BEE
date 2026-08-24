"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSuccessPatterns } from "@/lib/api/feedback";
import { queryKeys } from "@/lib/query-keys";

export function useSuccessPatterns(signalType?: string) {
  return useQuery({
    queryKey: queryKeys.feedback.patterns(signalType),
    queryFn: async () => fetchSuccessPatterns(signalType),
  });
}
