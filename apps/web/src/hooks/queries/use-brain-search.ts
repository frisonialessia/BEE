"use client";

import { useQuery } from "@tanstack/react-query";

import { searchBrain } from "@/lib/api/search";
import { queryKeys } from "@/lib/query-keys";

/** Pair this with useDebouncedValue on the raw input — `query` here should
 * already be the debounced value, so a fast typist doesn't fire one request
 * per keystroke. Disabled below 3 characters: same floor searchBrain()
 * itself enforces, kept here too so the query key doesn't even form (and
 * react-query doesn't cache a request that was never sent). */
export function useBrainSearch(query: string, limit = 10) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.search.brain(q, limit),
    queryFn: async () => searchBrain(q, limit),
    enabled: q.length >= 3,
  });
}
