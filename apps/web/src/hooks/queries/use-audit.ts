"use client";

import { useQuery } from "@tanstack/react-query";

import { getAuditDecisions } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { AuditEntry } from "@/lib/types";
import type { FetchResult } from "@/types/api";

/**
 * Most recent strategy_generator audit-trail entry for this opportunity, if
 * one was recorded. AuditTrailService writes these per-decision — not
 * guaranteed for every generated strategy — so an empty result is a normal,
 * expected outcome, not an error state.
 */
export function useStrategyReasoning(opportunityId: string) {
  return useQuery<FetchResult<AuditEntry | null>>({
    queryKey: queryKeys.auditDecisions.strategyReasoning(opportunityId),
    queryFn: async () => {
      const result = await getAuditDecisions({
        opportunity_id: opportunityId,
        agent_type: "strategy_generator",
        limit: 1,
      });
      return { ...result, data: result.data[0] ?? null };
    },
    enabled: Boolean(opportunityId),
  });
}
