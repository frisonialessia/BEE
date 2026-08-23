"use client";

import { useQuery } from "@tanstack/react-query";

import { getLeadDISCProfile } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Perfil DISC de un lead — se clasifica en el backend la primera vez que se pide. */
export function useLeadDiscProfile(leadId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.psychographic.lead(leadId ?? ""),
    queryFn: async () => getLeadDISCProfile(leadId!),
    enabled: Boolean(leadId),
    retry: false,
  });
}
