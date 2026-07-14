import type { ArtifactBundle, Battlecard, OutcomeIn, OutcomeOut, Signal } from "@/lib/types";
import { sampleArtifacts, sampleBattlecards, sampleSignals } from "@/lib/sample-data";

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

/**
 * Fetch execution artifacts for an opportunity.
 * Triggers ExecutiveAgent generation on first call; subsequent calls return cached data.
 */
export async function getArtifacts(
  opportunityId: string,
  force = false,
): Promise<FetchResult<ArtifactBundle>> {
  try {
    const url = `${API_URL}/api/v1/opportunities/${opportunityId}/artifacts${force ? "?force=true" : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = (await res.json()) as ArtifactBundle;
    return { data, live: true };
  } catch {
    const sample = sampleArtifacts.find((a) => a.opportunity_id === opportunityId);
    if (sample) return { data: sample, live: false };
    throw new Error(`No artifacts found for opportunity ${opportunityId}`);
  }
}

/**
 * Record a WON or LOST outcome for an opportunity.
 * This triggers the FeedbackLoopService and BEE's adaptive learning.
 */
export async function recordOutcome(
  opportunityId: string,
  body: OutcomeIn,
): Promise<OutcomeOut> {
  const res = await fetch(`${API_URL}/api/v1/opportunities/${opportunityId}/outcome`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `API error ${res.status}`);
  }
  return res.json() as Promise<OutcomeOut>;
}
