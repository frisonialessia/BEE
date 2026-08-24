"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTask, deleteTask, fetchTasks, updateTask } from "@/lib/api/tasks";
import { queryKeys } from "@/lib/query-keys";
import type { OpportunityTaskCreateIn, OpportunityTaskUpdateIn } from "@/types/domain";

/** Tareas abiertas y cerradas de una oportunidad — para el panel del drawer. */
export function useOpportunityTasks(opportunityId: string) {
  return useQuery({
    queryKey: queryKeys.tasks.list(opportunityId),
    queryFn: async () => fetchTasks({ opportunityId, includeCompleted: true }),
    enabled: Boolean(opportunityId),
  });
}

/** Tareas abiertas y vencidas de todas las oportunidades visibles — para el
 *  Brief del día. */
export function useOverdueTasks() {
  return useQuery({
    queryKey: queryKeys.tasks.overdue(),
    queryFn: async () => fetchTasks({ overdueOnly: true }),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OpportunityTaskCreateIn) => createTask(body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(variables.opportunity_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overdue() });
    },
  });
}

export function useUpdateTask(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OpportunityTaskUpdateIn }) => updateTask(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(opportunityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overdue() });
    },
  });
}

export function useDeleteTask(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(opportunityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overdue() });
    },
  });
}
