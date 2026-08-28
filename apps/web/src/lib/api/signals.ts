import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchSignals } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type { Signal } from "@/types/domain";
import { sampleSignals } from "@/lib/sample-data";

export async function fetchSignals(limit = 50): Promise<FetchResult<Signal[]>> {
  if (isDemoMode()) return { data: demoFetchSignals(limit), live: false };
  try {
    const data = await apiFetch<Signal[]>(`/api/v1/signals?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    return { data, live: true };
  } catch {
    return { data: sampleSignals, live: false };
  }
}
