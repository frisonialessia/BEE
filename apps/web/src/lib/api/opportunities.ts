import { apiFetch } from "@/lib/api/client";
import { predictCycle } from "@/lib/cycle-prediction";
import {
  demoCreateOpportunity,
  demoFetchAllBattlecards,
  demoFetchOpportunities,
  demoFetchSignals,
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
  SignalType,
} from "@/types/domain";
import type { CyclePrediction, OutcomeWithPrediction } from "@/types/extended";
import { sampleArtifacts, sampleBattlecards } from "@/lib/sample-data";

export interface OpportunityCreateIn {
  company_name: string;
  company_domain?: string;
  company_industry?: string;
  company_country?: string;
  lead_full_name?: string;
  lead_email?: string;
  lead_title?: string;
  lead_seniority?: string;
  lead_linkedin_url?: string;
  signal_type?: SignalType;
  title?: string;
  description: string;
  score?: number;
}

/** Carga manual de una oportunidad — el "+ Nueva oportunidad" del CRM y de
 *  la ficha de empresa. En cuenta real, resuelve (o crea) la empresa/lead
 *  igual que la ingesta automática y dispara la misma generación de
 *  estrategia con IA — ver el docstring de `POST /opportunities` en el
 *  backend. En el sandbox corre el mismo flujo, pero localmente: arma un
 *  battlecard con las plantillas de `lib/demo/templates.ts`, guardado solo
 *  en este navegador — misma política de honestidad que el resto del demo
 *  (nunca se manda a ningún backend real). */
export async function createOpportunity(body: OpportunityCreateIn): Promise<Opportunity> {
  if (isDemoMode()) {
    return demoCreateOpportunity({
      ...body,
      signal_type: body.signal_type ?? "other",
      score: body.score ?? 50,
    });
  }
  return apiFetch<Opportunity>("/api/v1/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
    // Honest empty, not fabricated demo data — same convention as
    // fetchSignals/fetchOpportunities. In practice this catch is dead code
    // today (fetchOpportunities already swallows its own errors and never
    // throws), but it must degrade the same way if that ever changes.
    return { data: [], live: false };
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

/** Predicted time-to-close for one open opportunity — see
 *  CyclePredictorService's module docstring for the algorithm. `available:
 *  false` inside the response is a normal outcome (too little history, or
 *  the opportunity is already closed), never an error; `live: false` here
 *  is separate and only means "computed locally from demo data", same
 *  meaning as everywhere else in this file. */
export async function fetchCyclePrediction(
  opportunityId: string,
): Promise<FetchResult<CyclePrediction>> {
  if (isDemoMode()) {
    const opportunities = demoFetchOpportunities();
    const target = opportunities.find((o) => o.id === opportunityId);
    if (!target) throw new Error(`No demo opportunity ${opportunityId}`);
    const signals = demoFetchSignals(1000);
    const battlecards = demoFetchAllBattlecards();
    return { data: predictCycle(target, opportunities, signals, battlecards), live: false };
  }
  const data = await apiFetch<CyclePrediction>(
    `/api/v1/opportunities/${opportunityId}/cycle-prediction`,
    { next: { revalidate: 15 } },
  );
  return { data, live: true };
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
