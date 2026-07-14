import type {
  ArtifactBundle,
  Battlecard,
  MarketInsight,
  OrchestratorStatus,
  OutcomeIn,
  OutcomeWithPrediction,
  PendingAction,
  RevenueSimulation,
  Signal,
  WorkflowStatus,
  WorkflowTask,
} from "@/lib/types";
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
): Promise<OutcomeWithPrediction> {
  const res = await fetch(`${API_URL}/api/v1/opportunities/${opportunityId}/outcome`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `API error ${res.status}`);
  }
  return res.json() as Promise<OutcomeWithPrediction>;
}

// ── AgentOrchestrator ─────────────────────────────────────────────────────────

/** Fetch all actions pending human approval. */
export async function getPendingActions(limit = 50): Promise<FetchResult<PendingAction[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/orchestrator/pending-actions?limit=${limit}`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as PendingAction[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

/** Fetch the orchestrator queue health summary. */
export async function getOrchestratorStatus(): Promise<FetchResult<OrchestratorStatus>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/orchestrator/status`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as OrchestratorStatus, live: true };
  } catch {
    return {
      data: { total_pending: 0, total_approved: 0, total_executing: 0, total_completed: 0, total_failed: 0, total_rejected: 0 },
      live: false,
    };
  }
}

/** Approve a pending action. */
export async function approveAction(actionId: string, approvedBy: string): Promise<PendingAction> {
  const res = await fetch(`${API_URL}/api/v1/orchestrator/${actionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<PendingAction>;
}

/** Reject a pending action. */
export async function rejectAction(actionId: string, reason?: string): Promise<PendingAction> {
  const res = await fetch(`${API_URL}/api/v1/orchestrator/${actionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<PendingAction>;
}

// ── WorkflowOrchestrator (event bus) ─────────────────────────────────────────

/** Fetch recent workflow tasks dispatched by the event bus. */
export async function getWorkflowTasks(
  entity_id?: string,
  limit = 50,
): Promise<FetchResult<WorkflowTask[]>> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (entity_id) params.set("entity_id", entity_id);
    const res = await fetch(`${API_URL}/api/v1/analytics/workflows?${params}`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as WorkflowTask[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

/** Fetch workflow bus health summary. */
export async function getWorkflowStatus(): Promise<FetchResult<WorkflowStatus>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/analytics/workflows/status`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as WorkflowStatus, live: true };
  } catch {
    return {
      data: { total_tasks: 0, dispatched: 0, mock_dispatched: 0, completed: 0, failed: 0, skipped: 0, pending: 0 },
      live: false,
    };
  }
}

// ── RevenueSimulator ──────────────────────────────────────────────────────────

/** Run a revenue simulation for a prospecting segment. */
export async function runRevenueSimulation(params: {
  signal_type: string;
  industry?: string;
  increase_factor?: number;
}): Promise<FetchResult<RevenueSimulation>> {
  try {
    const query = new URLSearchParams({ signal_type: params.signal_type });
    if (params.industry) query.set("industry", params.industry);
    if (params.increase_factor != null) query.set("increase_factor", String(params.increase_factor));
    const res = await fetch(`${API_URL}/api/v1/analytics/simulator?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as RevenueSimulation, live: true };
  } catch {
    return { data: null as unknown as RevenueSimulation, live: false };
  }
}

// ── TrendAnalyst / Market Insights ─────────────────────────────────────────────

/** Fetch active market insights, optionally filtered by signal type / industry. */
export async function getMarketInsights(
  signal_type?: string,
  industry?: string,
  limit = 10,
): Promise<FetchResult<MarketInsight[]>> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (signal_type) params.set("signal_type", signal_type);
    if (industry) params.set("industry", industry);
    const res = await fetch(`${API_URL}/api/v1/insights?${params}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as MarketInsight[], live: true };
  } catch {
    return { data: [], live: false };
  }
}
