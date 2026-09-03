"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompany,
  fetchCompanies,
  fetchCompany,
  fetchCompanyActivity,
  fetchCompanyBrief,
  fetchCompanyDuplicates,
  fetchLookalikeCompanies,
  mergeCompanies,
  researchCompany,
  scanCompany,
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

/** Untapped companies BEE's vector store ranked as resembling this org's
 * closed-won book — see LookalikeService's docstring on the backend. Empty
 * in demo mode (see fetchLookalikeCompanies) and for any org still short a
 * won deal or an untapped prospect to compare against — both honest, not
 * an error, so this never needs its own loading/error UI beyond "show
 * nothing when there's nothing to show." */
export function useLookalikeCompanies(limit = 8) {
  return useQuery({
    queryKey: queryKeys.companies.lookalikes(),
    queryFn: async () => fetchLookalikeCompanies(limit),
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

/** Passive — just checks whether a brief already exists. Never triggers
 * research on its own (see researchCompany's own "explicit action" note). */
export function useCompanyBrief(companyId: string) {
  return useQuery({
    queryKey: queryKeys.companies.brief(companyId),
    queryFn: async () => fetchCompanyBrief(companyId),
    enabled: Boolean(companyId),
  });
}

export function useResearchCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, force }: { companyId: string; force?: boolean }) =>
      researchCompany(companyId, force),
    onSuccess: (_result, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.brief(companyId) });
    },
  });
}

/** On-demand market scan for one account. New signals land in the same
 *  lists the cron's do, so those are what gets refreshed. */
export function useScanCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => scanCompany(companyId),
    onSuccess: (_result, companyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.activity(companyId) });
    },
  });
}
