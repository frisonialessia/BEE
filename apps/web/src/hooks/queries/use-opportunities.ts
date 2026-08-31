"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOpportunity,
  fetchBattlecards,
  fetchOpportunities,
  moveOpportunityStage,
  updateOpportunity,
  type CrmStage,
  type OpportunityCreateIn,
  type OpportunityUpdateIn,
} from "@/lib/api/opportunities";
import { queryKeys } from "@/lib/query-keys";
import type { FetchResult } from "@/types/api";
import type { Opportunity, OpportunityStatus } from "@/types/domain";

export function useOpportunities(status?: OpportunityStatus, limit = 50) {
  return useQuery({
    queryKey: queryKeys.opportunities.list(status),
    queryFn: async () => fetchOpportunities(status, limit),
  });
}

export function useBattlecards() {
  return useQuery({
    queryKey: queryKeys.battlecards.ready(),
    queryFn: async () => fetchBattlecards(),
  });
}

/** Alta manual de una oportunidad — invalida Oportunidades, y también
 *  Empresas/Leads porque el mismo POST puede resolver-o-crear una empresa y
 *  un lead nuevos (el mismo get-or-create que usa la ingesta automática), no
 *  solo la oportunidad. */
export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OpportunityCreateIn) => createOpportunity(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
  });
}

export function useUpdateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OpportunityUpdateIn }) =>
      updateOpportunity(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}

/** Mueve una tarjeta en el Kanban del CRM — optimista: la tarjeta cambia de
 *  columna al soltar, no cuando responde la red. Si el backend rechaza el
 *  move (battlecard incompleto, oportunidad ya cerrada), se revierte a su
 *  columna real y el error queda disponible para mostrarlo. */
export function useMoveOpportunityStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CrmStage }) => moveOpportunityStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.all });
      const previous = queryClient.getQueriesData<FetchResult<Opportunity[]>>({
        queryKey: queryKeys.opportunities.all,
      });
      queryClient.setQueriesData<FetchResult<Opportunity[]>>(
        { queryKey: queryKeys.opportunities.all },
        (old) =>
          old && {
            ...old,
            data: old.data.map((o) => (o.id === id ? { ...o, status: stage } : o)),
          },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}
