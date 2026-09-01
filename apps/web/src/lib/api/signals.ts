import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchSignals } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type { Signal } from "@/types/domain";

export async function fetchSignals(limit = 50): Promise<FetchResult<Signal[]>> {
  if (isDemoMode()) return { data: demoFetchSignals(limit), live: false };
  try {
    const data = await apiFetch<Signal[]>(`/api/v1/signals?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    return { data, live: true };
  } catch {
    // Honest empty, not fabricated demo data — a real account hitting a
    // transient failure (or an expired session, which apiFetch throws for
    // same as any other non-2xx) must never render illustrative companies
    // ("Northwind Labs") as if they were real. Same convention every other
    // fetch* in this module tree follows (fetchOpportunities, fetchCompanies,
    // fetchLeads, ...) — this one used to be the exception.
    return { data: [], live: false };
  }
}
