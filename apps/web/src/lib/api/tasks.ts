import { apiFetch } from "@/lib/api/client";
import { demoCreateTask, demoDeleteTask, demoFetchTasks, demoUpdateTask } from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";
import type { OpportunityTask, OpportunityTaskCreateIn, OpportunityTaskUpdateIn } from "@/types/domain";

export async function fetchTasks(params: {
  opportunityId?: string;
  includeCompleted?: boolean;
  overdueOnly?: boolean;
}): Promise<FetchResult<OpportunityTask[]>> {
  if (isDemoMode()) {
    return { data: demoFetchTasks(params), live: false };
  }
  try {
    const search = new URLSearchParams();
    if (params.opportunityId) search.set("opportunity_id", params.opportunityId);
    if (params.includeCompleted) search.set("include_completed", "true");
    if (params.overdueOnly) search.set("overdue_only", "true");
    const data = await apiFetch<OpportunityTask[]>(`/api/v1/tasks?${search}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createTask(body: OpportunityTaskCreateIn): Promise<OpportunityTask> {
  if (isDemoMode()) return demoCreateTask(body);
  return apiFetch<OpportunityTask>("/api/v1/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTask(
  taskId: string,
  body: OpportunityTaskUpdateIn,
): Promise<OpportunityTask> {
  if (isDemoMode()) return demoUpdateTask(taskId, body);
  return apiFetch<OpportunityTask>(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  if (isDemoMode()) {
    demoDeleteTask(taskId);
    return;
  }
  await apiFetch<void>(`/api/v1/tasks/${taskId}`, { method: "DELETE" });
}
