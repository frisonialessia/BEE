import { apiFetch } from "@/lib/api/client";
import type { FetchResult } from "@/types/api";
import type {
  ArtifactBundle,
  Battlecard,
  Opportunity,
  OpportunityStatus,
  OutcomeIn,
} from "@/types/domain";
import type { OutcomeWithPrediction } from "@/types/extended";
import { sampleArtifacts, sampleBattlecards } from "@/lib/sample-data";

export async function fetchOpportunities(
  status?: OpportunityStatus,
  limit = 50,
): Promise<FetchResult<Opportunity[]>> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set("status", status);
    const data = await apiFetch<Opportunity[]>(
      `/api/v1/opportunities?${params}`,
      { next: { revalidate: 15 } },
    );
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function fetchBattlecard(
  opportunityId: string,
): Promise<FetchResult<Battlecard>> {
  try {
    const data = await apiFetch<Battlecard>(
      `/api/v1/opportunities/${opportunityId}/battlecard`,
      { next: { revalidate: 15 } },
    );
    return { data, live: true };
  } catch {
    const sample = sampleBattlecards.find((b) => b.opportunity_id === opportunityId);
    if (sample) return { data: sample, live: false };
    throw new Error(`No battlecard for opportunity ${opportunityId}`);
  }
}

export async function fetchBattlecards(): Promise<FetchResult<Battlecard[]>> {
  try {
    const { data: list } = await fetchOpportunities("ready_to_action");
    const cards = await Promise.all(
      list.map(async (item) => {
        const { data } = await fetchBattlecard(item.id);
        return data;
      }),
    );
    return { data: cards, live: true };
  } catch {
    return { data: sampleBattlecards, live: false };
  }
}

export async function fetchArtifacts(
  opportunityId: string,
  force = false,
): Promise<FetchResult<ArtifactBundle>> {
  try {
    const path = `/api/v1/opportunities/${opportunityId}/artifacts${force ? "?force=true" : ""}`;
    const data = await apiFetch<ArtifactBundle>(path, { cache: "no-store" });
    return { data, live: true };
  } catch {
    const sample = sampleArtifacts.find((a) => a.opportunity_id === opportunityId);
    if (sample) return { data: sample, live: false };
    throw new Error(`No artifacts for opportunity ${opportunityId}`);
  }
}

export async function recordOutcome(
  opportunityId: string,
  body: OutcomeIn,
): Promise<OutcomeWithPrediction> {
  return apiFetch<OutcomeWithPrediction>(
    `/api/v1/opportunities/${opportunityId}/outcome`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
