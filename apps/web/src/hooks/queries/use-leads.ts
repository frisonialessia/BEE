"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bulkCreateLeads, createLead, fetchLeads, type LeadCreateIn } from "@/lib/api/leads";
import { queryKeys } from "@/lib/query-keys";

export function useLeads(limit = 50) {
  return useQuery({
    queryKey: queryKeys.leads.list(limit),
    queryFn: async () => fetchLeads(limit),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadCreateIn) => createLead(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
  });
}

export function useBulkCreateLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leads: LeadCreateIn[]) => bulkCreateLeads(leads),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
  });
}
