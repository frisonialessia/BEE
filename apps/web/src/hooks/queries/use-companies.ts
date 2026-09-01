"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompany,
  fetchCompanies,
  fetchCompany,
  fetchCompanyActivity,
  fetchCompanyDuplicates,
  mergeCompanies,
  updateCompany,
  type CompanyCreateIn,
  type CompanyUpdateIn,
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

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, body }: { companyId: string; body: CompanyUpdateIn }) =>
      updateCompany(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
}

export function useCompanyActivity(companyId: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.companies.activity(companyId),
    queryFn: async () => fetchCompanyActivity(companyId, limit),
    enabled: Boolean(companyId),
  });
}
