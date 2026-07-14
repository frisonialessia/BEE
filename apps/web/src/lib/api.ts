import type { Signal } from "@/lib/types";
import { sampleSignals } from "@/lib/sample-data";

/**
 * Thin client for the BEE API.
 *
 * The base URL is read from `NEXT_PUBLIC_API_URL` so the frontend can point at
 * local, staging, or production backends without code changes. When the API is
 * unreachable, callers can fall back to illustrative sample data so the UI stays
 * renderable in previews.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FetchResult<T> {
  data: T;
  live: boolean; // true when served by the real API, false when using samples
}

/**
 * Fetch recent signals from the API, gracefully falling back to sample data.
 *
 * Uses a short revalidation window so the dashboard stays fresh without
 * hammering the backend. Any network/HTTP failure returns the sample dataset and
 * flags `live: false` so the UI can surface a "demo data" hint.
 */
export async function getSignals(limit = 50): Promise<FetchResult<Signal[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/signals?limit=${limit}`, {
      next: { revalidate: 15 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = (await res.json()) as Signal[];
    return { data, live: true };
  } catch {
    return { data: sampleSignals, live: false };
  }
}
