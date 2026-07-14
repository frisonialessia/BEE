import type {
  AdaptedContent,
  AdvanceResult,
  ArtifactBundle,
  AuditEntry,
  AuditSummary,
  Battlecard,
  BrandContextResult,
  BrandFragment,
  ChannelStatus,
  DarkFunnelSignal,
  DarkFunnelSummary,
  DLQRetryResult,
  DLQSummary,
  DynamicSequence,
  EngagementAnalysis,
  EngagementEvent,
  FailedEvent,
  HotLeadScore,
  LeadPsychographic,
  MarketInsight,
  NetworkConnection,
  NetworkQueryResult,
  NetworkStats,
  OrchestratorStatus,
  OutcomeIn,
  OutcomeWithPrediction,
  PendingAction,
  RevenueSimulation,
  SequenceExecution,
  Signal,
  VoiceProfile,
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

// ── PersonalBrandService ────────────────────────────────────────────────────

export async function getBrandProfile(): Promise<FetchResult<VoiceProfile | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/brand/profile`, { cache: "no-store" });
    if (res.status === 404) return { data: null, live: true };
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as VoiceProfile, live: true };
  } catch {
    return { data: null, live: false };
  }
}

export async function createBrandProfile(data: {
  display_name: string;
  title?: string;
  language?: string;
  tone_descriptors?: string[];
  authority_topics?: string[];
  forbidden_phrases?: string[];
  preferred_cta?: string;
  bio_summary?: string;
}): Promise<FetchResult<VoiceProfile>> {
  const res = await fetch(`${API_URL}/api/v1/brand/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as VoiceProfile, live: true };
}

export async function addBrandFragment(
  profileId: string,
  data: { content: string; category: string; tags?: string[]; source?: string }
): Promise<FetchResult<BrandFragment>> {
  const res = await fetch(`${API_URL}/api/v1/brand/profile/${profileId}/fragments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as BrandFragment, live: true };
}

export async function getBrandContext(query: string, top_k = 5): Promise<FetchResult<BrandContextResult>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/brand/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as BrandContextResult, live: true };
  } catch {
    return {
      data: { voice_profile: null, relevant_fragments: [], brand_brief: "", fragment_count_total: 0 },
      live: false,
    };
  }
}

export async function getChannelStatus(): Promise<FetchResult<ChannelStatus[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/brand/channels/status`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as ChannelStatus[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

// ── SmartEngagementEngine ───────────────────────────────────────────────────

export async function getEngagementEvents(params?: {
  source?: string;
  processed?: boolean;
}): Promise<FetchResult<EngagementEvent[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.source) query.set("source", params.source);
    if (params?.processed != null) query.set("processed", String(params.processed));
    const res = await fetch(`${API_URL}/api/v1/engagement/events?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as EngagementEvent[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function submitEngagementEvent(data: {
  source: string;
  content: string;
  author_name?: string;
  author_handle?: string;
  context_post?: string;
  source_event_id?: string;
}): Promise<FetchResult<EngagementAnalysis>> {
  const res = await fetch(`${API_URL}/api/v1/engagement/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as EngagementAnalysis, live: true };
}

// ── DynamicSequenceEngine ───────────────────────────────────────────────────

export async function getSequences(): Promise<FetchResult<DynamicSequence[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/sequences`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as DynamicSequence[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function getSequenceExecutions(params?: {
  status?: string;
}): Promise<FetchResult<SequenceExecution[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    const res = await fetch(`${API_URL}/api/v1/sequences/executions?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as SequenceExecution[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function advanceSequenceExecution(
  executionId: string,
  event: string,
  metadata?: Record<string, unknown>
): Promise<FetchResult<AdvanceResult>> {
  const res = await fetch(`${API_URL}/api/v1/sequences/executions/${executionId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata: metadata ?? {} }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as AdvanceResult, live: true };
}

// ─── PsychographicAnalyzer ────────────────────────────────────────────────────

export async function getLeadDISCProfile(leadId: string): Promise<FetchResult<LeadPsychographic>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/psychographic/leads/${leadId}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as LeadPsychographic, live: true };
  } catch {
    return { data: null as unknown as LeadPsychographic, live: false };
  }
}

export async function adaptContent(payload: {
  content: string;
  lead_id: string;
  artifact_type?: string;
}): Promise<FetchResult<AdaptedContent>> {
  const res = await fetch(`${API_URL}/api/v1/psychographic/adapt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as AdaptedContent, live: true };
}

export async function listDISCProfiles(): Promise<FetchResult<LeadPsychographic[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/psychographic/profiles`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as LeadPsychographic[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

// ─── DarkFunnelService ────────────────────────────────────────────────────────

export async function getDarkFunnelHotLeads(params?: {
  min_score?: number;
  buying_stage?: string;
  hot_only?: boolean;
  limit?: number;
}): Promise<FetchResult<HotLeadScore[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.min_score !== undefined) query.set("min_score", String(params.min_score));
    if (params?.buying_stage) query.set("buying_stage", params.buying_stage);
    if (params?.hot_only) query.set("hot_only", "true");
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await fetch(`${API_URL}/api/v1/dark-funnel/hot-leads?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as HotLeadScore[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function getDarkFunnelSummary(): Promise<FetchResult<DarkFunnelSummary | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/dark-funnel/summary`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as DarkFunnelSummary, live: true };
  } catch {
    return { data: null, live: false };
  }
}

export async function ingestDarkFunnelSignal(payload: {
  company_domain: string;
  signal_type: string;
  company_name?: string;
  intent_keywords?: string[];
  source_platform?: string;
}): Promise<FetchResult<DarkFunnelSignal>> {
  const res = await fetch(`${API_URL}/api/v1/dark-funnel/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as DarkFunnelSignal, live: true };
}

// ─── NetworkNavigator ─────────────────────────────────────────────────────────

export async function getNetworkConnections(): Promise<FetchResult<NetworkConnection[]>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/network/connections`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as NetworkConnection[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function addNetworkConnection(payload: {
  contact_name: string;
  contact_company: string;
  contact_domain: string;
  contact_title?: string;
  relationship_strength: number;
  connection_type?: string;
  notes?: string;
}): Promise<FetchResult<NetworkConnection>> {
  const res = await fetch(`${API_URL}/api/v1/network/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as NetworkConnection, live: true };
}

export async function findIntroPaths(params: {
  target_domain: string;
  target_company?: string;
  target_name?: string;
}): Promise<FetchResult<NetworkQueryResult>> {
  try {
    const query = new URLSearchParams({ target_domain: params.target_domain });
    if (params.target_company) query.set("target_company", params.target_company);
    if (params.target_name) query.set("target_name", params.target_name);
    const res = await fetch(`${API_URL}/api/v1/network/paths?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as NetworkQueryResult, live: true };
  } catch {
    return { data: null as unknown as NetworkQueryResult, live: false };
  }
}

export async function getNetworkStats(): Promise<FetchResult<NetworkStats | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/network/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as NetworkStats, live: true };
  } catch {
    return { data: null, live: false };
  }
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export async function getDLQSummary(): Promise<FetchResult<DLQSummary | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/workflow/dlq/summary`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as DLQSummary, live: true };
  } catch {
    return { data: null, live: false };
  }
}

export async function getDLQEvents(params?: { status?: string; limit?: number }): Promise<FetchResult<FailedEvent[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await fetch(`${API_URL}/api/v1/workflow/dlq?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as FailedEvent[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function retryDLQEvent(eventId: string): Promise<FetchResult<DLQRetryResult>> {
  const res = await fetch(`${API_URL}/api/v1/workflow/dlq/${eventId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as DLQRetryResult, live: true };
}

export async function resolveDLQEvent(eventId: string, notes?: string): Promise<FetchResult<FailedEvent>> {
  const res = await fetch(`${API_URL}/api/v1/workflow/dlq/${eventId}/resolve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as FailedEvent, live: true };
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export async function getAuditSummary(): Promise<FetchResult<AuditSummary | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/audit/summary`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as AuditSummary, live: true };
  } catch {
    return { data: null, live: false };
  }
}

// ─── Correction Learning ──────────────────────────────────────────────────────

export async function recordCorrection(data: {
  original_content: string;
  edited_content: string;
  artifact_type: string;
  opportunity_id?: string;
  psychographic_style?: string;
}): Promise<FetchResult<import("@/lib/types").CorrectionOut>> {
  const res = await fetch(`${API_URL}/api/v1/learning/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

export async function getStyleProfile(): Promise<FetchResult<import("@/lib/types").StyleProfileOut | null>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/learning/style-profile`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: null, live: false };
  }
}

// ─── Scenario Simulator ───────────────────────────────────────────────────────

export async function runScenario(params: {
  sector?: string;
  signal_type?: string;
  channel?: string;
  psychographic_style?: string;
  target_monthly_signals: number;
  additional_prospecting_reps?: number;
  dark_funnel_heat?: number;
}): Promise<FetchResult<import("@/lib/types").ScenarioResult>> {
  const res = await fetch(`${API_URL}/api/v1/analytics/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

// ─── Anomaly Detector ─────────────────────────────────────────────────────────

export async function getAnomalyAlerts(params?: { status?: string; severity?: string }): Promise<FetchResult<import("@/lib/types").AnomalyAlert[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.severity) query.set("severity", params.severity);
    const res = await fetch(`${API_URL}/api/v1/analytics/anomalies?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function checkAnomalies(): Promise<FetchResult<import("@/lib/types").AnomalyCheckResult>> {
  const res = await fetch(`${API_URL}/api/v1/analytics/anomalies/check`, { method: "POST" });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

export async function acknowledgeAnomaly(alertId: string, notes?: string): Promise<FetchResult<import("@/lib/types").AnomalyAlert>> {
  const res = await fetch(`${API_URL}/api/v1/analytics/anomalies/${alertId}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

export async function getAuditDecisions(params?: {
  agent_type?: string;
  manual_review_required?: boolean;
  opportunity_id?: string;
  limit?: number;
}): Promise<FetchResult<AuditEntry[]>> {
  try {
    const query = new URLSearchParams();
    if (params?.agent_type) query.set("agent_type", params.agent_type);
    if (params?.manual_review_required !== undefined) query.set("manual_review_required", String(params.manual_review_required));
    if (params?.opportunity_id) query.set("opportunity_id", params.opportunity_id);
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await fetch(`${API_URL}/api/v1/audit/decisions?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as AuditEntry[], live: true };
  } catch {
    return { data: [], live: false };
  }
}
