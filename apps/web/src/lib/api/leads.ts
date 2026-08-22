import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";
import type { Lead } from "@/types/domain";

export async function fetchLeads(limit = 50): Promise<FetchResult<Lead[]>> {
  try {
    const data = await apiFetch<Lead[]>(`/api/v1/leads?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}
