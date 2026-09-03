import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchQuotas } from "@/lib/demo/overview";
import type { FetchResult } from "@/types/api";

export interface Quota {
  id: string;
  user_id: string | null;
  team_id: string | null;
  period_start: string;
  period_end: string;
  target_amount: number;
  /** New-clients target — a rep can be measured on money, on logos, or both. */
  target_count: number | null;
}

export interface QuotaCreateIn {
  user_id?: string;
  team_id?: string;
  period_start: string;
  period_end: string;
  target_amount?: number;
  target_count?: number;
}

export async function fetchQuotas(): Promise<FetchResult<Quota[]>> {
  if (isDemoMode()) return { data: demoFetchQuotas(), live: false };
  try {
    const data = await apiFetch<Quota[]>("/api/v1/quotas", { cache: "no-store" });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function createQuota(body: QuotaCreateIn): Promise<Quota> {
  return apiFetch<Quota>("/api/v1/quotas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteQuota(quotaId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/quotas/${quotaId}`, { method: "DELETE" });
}
