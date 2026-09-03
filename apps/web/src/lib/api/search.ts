import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import type { FetchResult } from "@/types/api";

/** One match from BEE's cross-entity semantic search — see
 * BrainSearchService on the backend. */
export interface BrainSearchResult {
  entity_type: "signal" | "company" | "opportunity";
  entity_id: string;
  title: string;
  snippet: string;
  /** 0 (weak match) .. 1 (near-exact match). */
  score: number;
}

/** The Command Palette that calls this only ever mounts inside the real
 * dashboard layout, never /probar — so this never runs against
 * client-only sandbox data. Guarded anyway for the same "never call a
 * real backend from demo mode" convention the rest of lib/api follows. */
export async function searchBrain(query: string, limit = 10): Promise<FetchResult<BrainSearchResult[]>> {
  const q = query.trim();
  if (isDemoMode() || q.length < 3) return { data: [], live: false };
  try {
    const data = await apiFetch<BrainSearchResult[]>(
      `/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { cache: "no-store" },
    );
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}
