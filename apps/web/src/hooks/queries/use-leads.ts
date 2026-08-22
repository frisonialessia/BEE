"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchLeads } from "@/lib/api/leads";
import { queryKeys } from "@/lib/query-keys";

export function useLeads(limit = 50) {
  return useQuery({
    queryKey: queryKeys.leads.list(limit),
    queryFn: async () => fetchLeads(limit),
  });
}
