"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCompanies, fetchCompany } from "@/lib/api/companies";
import { queryKeys } from "@/lib/query-keys";

export function useCompanies(limit = 100) {
  return useQuery({
    queryKey: queryKeys.companies.list(limit),
    queryFn: async () => fetchCompanies(limit),
  });
}

export function useCompany(companyId: string) {
  return useQuery({
    queryKey: queryKeys.companies.detail(companyId),
    queryFn: async () => fetchCompany(companyId),
    enabled: Boolean(companyId),
  });
}
