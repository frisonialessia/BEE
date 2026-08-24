import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";

// Mismo contrato que app.schemas.sequence en el backend (DynamicSequenceEngine).

export interface StepTransition {
  condition: string;
  next_step_id: string | null;
  delay_days: number;
}

export interface StepDefinition {
  id: string;
  name: string;
  action: string;
  artifact_type?: string | null;
  channel?: string | null;
  transitions: StepTransition[];
  fallback_step_id?: string | null;
  max_wait_days: number;
  notes?: string | null;
}

export interface SequenceCreateIn {
  name: string;
  description?: string;
  signal_type?: string;
  industry?: string;
  entry_step_id: string;
  steps: StepDefinition[];
  max_days: number;
}

export interface DynamicSequenceOut {
  id: string;
  name: string;
  description: string | null;
  signal_type: string | null;
  industry: string | null;
  entry_step_id: string;
  steps: StepDefinition[];
  max_days: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function fetchSequences(limit = 50): Promise<FetchResult<DynamicSequenceOut[]>> {
  try {
    const data = await apiFetch<DynamicSequenceOut[]>(`/api/v1/sequences?limit=${limit}`, {
      cache: "no-store",
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function fetchSequence(id: string): Promise<DynamicSequenceOut> {
  return apiFetch<DynamicSequenceOut>(`/api/v1/sequences/${id}`, { cache: "no-store" });
}

export async function createSequence(body: SequenceCreateIn): Promise<DynamicSequenceOut> {
  return apiFetch<DynamicSequenceOut>("/api/v1/sequences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function startSequenceExecution(body: {
  sequence_id: string;
  lead_id?: string;
  opportunity_id?: string;
}): Promise<{ id: string; status: string }> {
  return apiFetch("/api/v1/sequences/executions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
