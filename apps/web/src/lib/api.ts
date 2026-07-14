import type { Battlecard, Signal } from "@/lib/types";
import { sampleBattlecards, sampleSignals } from "@/lib/sample-data";

/**
 * Thin client for the BEE API.
 *
 * The base URL is read from `NEXT_PUBLIC_API_URL` so the frontend can point at
 * local, staging, or production backends without code changes. When the API is
 * unreachable, callers fall back to illustrative sample data so the UI stays
 * renderable in previews and demos.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FetchResult<T> {
  data: T;
  live: boolean; // true = served by the real API, false = illustrative sample data
}

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

export async function getBattlecards(): Promise<FetchResult<Battlecard[]>> {
  try {
    // Fetch opportunities with READY_TO_ACTION status, then hydrate each battlecard.
    const listRes = await fetch(`${API_URL}/api/v1/opportunities?status=ready_to_action`, {
      next: { revalidate: 15 },
    });
    if (!listRes.ok) throw new Error(`API responded ${listRes.status}`);
    const list = (await listRes.json()) as Array<{ id: string }>;

    const cards = await Promise.all(
      list.map(async (item) => {
        const res = await fetch(`${API_URL}/api/v1/opportunities/${item.id}/battlecard`, {
          next: { revalidate: 15 },
        });
        return res.json() as Promise<Battlecard>;
      })
    );
    return { data: cards, live: true };
  } catch {
    return { data: sampleBattlecards, live: false };
  }
}
