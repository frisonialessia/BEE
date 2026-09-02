import { useQuery } from "@tanstack/react-query";

import { getMarketInsights } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** TrendAnalyst's aggregate market view — see getMarketInsights's own
 * docstring. Refreshed server-side every 20th ingested signal, so a
 * moderate stale time here is fine; this isn't something a user action
 * changes. */
export function useMarketInsights(signalType?: string, industry?: string) {
  return useQuery({
    queryKey: queryKeys.marketInsights.list(signalType, industry),
    queryFn: async () => getMarketInsights(signalType, industry),
    staleTime: 60_000,
  });
}
