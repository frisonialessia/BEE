"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCompany, fetchCompanies, fetchCompany, type CompanyCreateIn } from "@/lib/api/companies";
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

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyCreateIn) => createCompany(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
}
