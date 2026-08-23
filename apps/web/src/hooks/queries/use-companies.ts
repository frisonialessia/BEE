"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompany,
  fetchCompanies,
  fetchCompany,
  fetchCompanyDuplicates,
  mergeCompanies,
  type CompanyCreateIn,
} from "@/lib/api/companies";
import { queryKeys } from "@/lib/query-keys";

export function useCompanies(limit = 100) {
  return useQuery({
    queryKey: queryKeys.companies.list(limit),
    queryFn: async () => fetchCompanies(limit),
  });
}

export function useCompanyDuplicates() {
  return useQuery({
    queryKey: queryKeys.companies.duplicates(),
    queryFn: async () => fetchCompanyDuplicates(),
  });
}

export function useMergeCompanies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keepId, mergeId }: { keepId: string; mergeId: string }) =>
      mergeCompanies(keepId, mergeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
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
