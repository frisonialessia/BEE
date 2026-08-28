import { apiFetch } from "@/lib/api/client";
import {
  demoFetchOpportunities,
  demoFindArtifacts,
  demoFindBattlecard,
  demoMoveOpportunityStage,
  demoRecordOutcome,
  demoUpdateOpportunity,
} from "@/lib/demo/store";
import { isDemoMode } from "@/lib/demo/mode";
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
  if (isDemoMode()) {
    return { data: demoFetchOpportunities(status).slice(0, limit), live: false };
  }
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
  if (isDemoMode()) {
    const sample =
      sampleBattlecards.find((b) => b.opportunity_id === opportunityId) ??
      demoFindBattlecard(opportunityId);
    if (sample) return { data: sample, live: false };
    throw new Error(`No demo battlecard for opportunity ${opportunityId}`);
  }
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
    // allSettled, not all: one opportunity's battlecard failing (a stale ID,
    // a transient 5xx) shouldn't throw away every other one that succeeded —
    // Promise.all would reject the whole batch and fall back to 100% demo
    // data for what could otherwise be an almost-fully-live dashboard.
    const settled = await Promise.allSettled(list.map((item) => fetchBattlecard(item.id)));
    const cards = settled
      .filter((r): r is PromiseFulfilledResult<FetchResult<Battlecard>> => r.status === "fulfilled")
      .map((r) => r.value.data);
    return { data: cards, live: true };
  } catch {
    return { data: sampleBattlecards, live: false };
  }
}

export async function fetchArtifacts(
  opportunityId: string,
  force = false,
): Promise<FetchResult<ArtifactBundle>> {
  if (isDemoMode()) {
    const sample =
      sampleArtifacts.find((a) => a.opportunity_id === opportunityId) ??
      demoFindArtifacts(opportunityId);
    if (sample) return { data: sample, live: false };
    throw new Error(`No demo artifacts for opportunity ${opportunityId}`);
  }
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
  if (isDemoMode()) return demoRecordOutcome(opportunityId, body);
  return apiFetch<OutcomeWithPrediction>(
    `/api/v1/opportunities/${opportunityId}/outcome`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export interface OpportunityUpdateIn {
  amount?: number | null;
  expected_close_date?: string | null;
  qualification?: Record<string, boolean> | null;
}

/** Actualiza monto, fecha esperada de cierre y/o checklist MEDDIC. */
export async function updateOpportunity(
  opportunityId: string,
  body: OpportunityUpdateIn,
): Promise<Opportunity> {
  if (isDemoMode()) return demoUpdateOpportunity(opportunityId, body);
  return apiFetch<Opportunity>(`/api/v1/opportunities/${opportunityId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type CrmStage = "detected" | "ready_to_action" | "prioritized" | "in_progress";

/** Mueve una oportunidad entre etapas del pipeline — el drag del Kanban del
 *  CRM. Solo las 4 etapas abiertas; ganar/perder sigue siendo una acción
 *  dedicada (`recordOutcome`), nunca una columna a la que se suelta una
 *  tarjeta. El backend rechaza el move con un 422 (mensaje real, nunca
 *  silencioso) si el battlecard no está completo para "Lista para actuar",
 *  o si la oportunidad ya está cerrada. */
export async function moveOpportunityStage(
  opportunityId: string,
  stage: CrmStage,
): Promise<Opportunity> {
  if (isDemoMode()) return demoMoveOpportunityStage(opportunityId, stage);
  return apiFetch<Opportunity>(`/api/v1/opportunities/${opportunityId}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: stage }),
  });
}
