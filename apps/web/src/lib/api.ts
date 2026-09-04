import type {
  AdaptedContent,
  AdvanceResult,
  ArtifactBundle,
  AuditEntry,
  AuditSummary,
  Battlecard,
  BrandContextResult,
  BrandFragment,
  BrandVoicePreviewResult,
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
  TodayFeedOut,
  VoiceProfile,
  VoiceProfileExtractResult,
  WorkflowStatus,
  WorkflowTask,
} from "@/lib/types";
import { buildApiHeaders, getApiBaseUrl } from "@/lib/api/client";
import { fetchBattlecards, fetchOpportunities } from "@/lib/api/opportunities";
import { fetchSignals } from "@/lib/api/signals";
import { isDemoMode } from "@/lib/demo/mode";
import {
  demoAcknowledgeAnomaly,
  demoAddBrandFragment,
  demoAddNetworkConnection,
  demoApproveAction,
  demoAuditSummary,
  demoCheckAnomalies,
  demoCreateBrandProfile,
  demoDeleteBrandFragment,
  demoDLQSummary,
  demoExtractVoiceProfile,
  demoFetchAnomalyAlerts,
  demoFetchAuditDecisions,
  demoFetchBrandProfile,
  demoFetchCompanies,
  demoFetchDLQEvents,
  demoFetchLeads,
  demoFetchNetworkConnections,
  demoFetchPendingActions,
  demoFetchStyleProfile,
  demoFindIntroPaths,
  demoGetMarketInsights,
  demoListBrandFragments,
  demoNetworkStats,
  demoPreviewBrandVoice,
  demoRecordCorrection,
  demoRejectAction,
  demoResolveDLQEvent,
  demoRetryDLQEvent,
} from "@/lib/demo/store";
import { demoClassifyLead } from "@/lib/demo/disc";
import type { FetchResult } from "@/types/api";
import type { Opportunity, OpportunityStatus } from "@/types/domain";
import { getSampleArtifacts, getSampleHotLeads } from "@/lib/sample-data";
import { getDemoLocale } from "@/lib/demo/locale";
import { demoDismissFromFeed, demoRevenueSimulation, demoTodayFeed } from "@/lib/demo/overview";

/**
 * Thin client for the BEE API.
 *
 * Core domain fetches live in `lib/api/{signals,opportunities}.ts`.
 * Extended subsystem calls remain here until migrated.
 */
export type { FetchResult };

export async function getSignals(limit = 50): Promise<FetchResult<Signal[]>> {
  return fetchSignals(limit);
}

export async function getBattlecards(): Promise<FetchResult<Battlecard[]>> {
  return fetchBattlecards();
}

export async function getOpportunities(
  status?: OpportunityStatus,
  limit = 50,
): Promise<FetchResult<Opportunity[]>> {
  return fetchOpportunities(status, limit);
}

const API_URL = getApiBaseUrl();

function beeFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: buildApiHeaders(init?.headers),
  });
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
    const res = await beeFetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = (await res.json()) as ArtifactBundle;
    return { data, live: true };
  } catch {
    const sample = getSampleArtifacts(getDemoLocale()).find((a) => a.opportunity_id === opportunityId);
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
  const res = await beeFetch(`${API_URL}/api/v1/opportunities/${opportunityId}/outcome`, {
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
  if (isDemoMode()) return { data: demoFetchPendingActions(limit), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/orchestrator/pending-actions?limit=${limit}`, {
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
    const res = await beeFetch(`${API_URL}/api/v1/orchestrator/status`, {
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
  if (isDemoMode()) return demoApproveAction(actionId, approvedBy);
  const res = await beeFetch(`${API_URL}/api/v1/orchestrator/${actionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<PendingAction>;
}

/** Reject a pending action. */
export async function rejectAction(actionId: string, reason?: string): Promise<PendingAction> {
  if (isDemoMode()) return demoRejectAction(actionId, reason);
  const res = await beeFetch(`${API_URL}/api/v1/orchestrator/${actionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<PendingAction>;
}

// ── PriorityFeedService (Bandeja de Decisiones) ──────────────────────────────

/** Today's ranked decisions — fuses DarkFunnel/CyclePredictor/AnomalyDetector
 *  into a small "what to act on today" feed. The sandbox derives the same
 *  shape locally from its own dataset (lib/demo/overview.ts) so /probar's
 *  Resumen is the real Resumen, not a trimmed copy. */
export async function getTodayFeed(): Promise<FetchResult<TodayFeedOut>> {
  if (isDemoMode()) return { data: demoTodayFeed(), live: false };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/priority/today`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as TodayFeedOut, live: true };
  } catch {
    return { data: { cards: [], generated_at: new Date().toISOString() }, live: false };
  }
}

/** "Descartar" — hide one opportunity from today's feed for a few days. */
export async function dismissFromTodayFeed(opportunityId: string): Promise<void> {
  if (isDemoMode()) {
    demoDismissFromFeed(opportunityId);
    return;
  }
  const res = await beeFetch(`${API_URL}/api/v1/priority/today/${opportunityId}/dismiss`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
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
    const res = await beeFetch(`${API_URL}/api/v1/analytics/workflows?${params}`, {
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
    const res = await beeFetch(`${API_URL}/api/v1/analytics/workflows/status`, {
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
  if (isDemoMode()) return { data: demoRevenueSimulation(params), live: false };
  try {
    const query = new URLSearchParams({ signal_type: params.signal_type });
    if (params.industry) query.set("industry", params.industry);
    if (params.increase_factor != null) query.set("increase_factor", String(params.increase_factor));
    const res = await beeFetch(`${API_URL}/api/v1/analytics/simulator?${query}`, { cache: "no-store" });
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
  if (isDemoMode()) {
    let insights = demoGetMarketInsights();
    if (signal_type) insights = insights.filter((i) => i.signal_type === signal_type);
    if (industry) insights = insights.filter((i) => i.industry === industry);
    return { data: insights.slice(0, limit), live: false };
  }
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (signal_type) params.set("signal_type", signal_type);
    if (industry) params.set("industry", industry);
    const res = await beeFetch(`${API_URL}/api/v1/insights?${params}`, {
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
  if (isDemoMode()) return { data: demoFetchBrandProfile(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/brand/profile`, { cache: "no-store" });
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
  if (isDemoMode()) return { data: demoCreateBrandProfile(data), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/brand/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as VoiceProfile, live: true };
}

/** Proposes a VoiceProfile draft from pasted writing samples — never
 * persisted by itself. The caller reviews/edits the result and still calls
 * createBrandProfile() to actually save it. */
export async function extractVoiceProfile(rawText: string): Promise<FetchResult<VoiceProfileExtractResult>> {
  if (isDemoMode()) return { data: demoExtractVoiceProfile(rawText), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/brand/profile/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as VoiceProfileExtractResult, live: true };
}

/** Live, on-demand comparison: generic AI output vs. this org's own voice,
 * for the same topic. Nothing is persisted. Throws (via a non-2xx status)
 * when there's no active voice profile yet — callers should only offer this
 * once a profile exists. */
export async function previewBrandVoice(topic: string): Promise<FetchResult<BrandVoicePreviewResult>> {
  if (isDemoMode()) return { data: demoPreviewBrandVoice(topic), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/brand/profile/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as BrandVoicePreviewResult, live: true };
}

export async function addBrandFragment(
  profileId: string,
  data: { content: string; category: string; tags?: string[]; source?: string }
): Promise<FetchResult<BrandFragment>> {
  if (isDemoMode()) return { data: demoAddBrandFragment(profileId, data), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/brand/profile/${profileId}/fragments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as BrandFragment, live: true };
}

export async function listBrandFragments(
  profileId: string,
  category?: string,
): Promise<FetchResult<BrandFragment[]>> {
  if (isDemoMode()) return { data: demoListBrandFragments(profileId), live: true };
  try {
    const params = category ? `?category=${encodeURIComponent(category)}` : "";
    const res = await beeFetch(`${API_URL}/api/v1/brand/profile/${profileId}/fragments${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as BrandFragment[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function deleteBrandFragment(fragmentId: string): Promise<void> {
  if (isDemoMode()) {
    demoDeleteBrandFragment(fragmentId);
    return;
  }
  const res = await beeFetch(`${API_URL}/api/v1/brand/fragments/${fragmentId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
}

export async function getBrandContext(query: string, top_k = 5): Promise<FetchResult<BrandContextResult>> {
  try {
    const res = await beeFetch(`${API_URL}/api/v1/brand/context`, {
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

/** Same "never invent 'conectado'" rule as everywhere else — in demo mode
 * every channel honestly reports mock/unauthenticated, matching what a
 * brand-new real org sees before connecting anything (see Integraciones). */
const DEMO_CHANNEL_STATUS: ChannelStatus[] = [
  {
    channel: "email",
    authenticated: false,
    mock: true,
    tokens_remaining: null,
    rate_limit: { requests_per_day: 0, requests_per_hour: 0, min_interval_seconds: 0 },
  },
  {
    channel: "linkedin",
    authenticated: false,
    mock: true,
    tokens_remaining: null,
    rate_limit: { requests_per_day: 0, requests_per_hour: 0, min_interval_seconds: 0 },
  },
];

export async function getChannelStatus(): Promise<FetchResult<ChannelStatus[]>> {
  if (isDemoMode()) return { data: DEMO_CHANNEL_STATUS, live: false };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/brand/channels/status`, { cache: "no-store" });
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
    const res = await beeFetch(`${API_URL}/api/v1/engagement/events?${query}`, { cache: "no-store" });
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
  const res = await beeFetch(`${API_URL}/api/v1/engagement/events`, {
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
    const res = await beeFetch(`${API_URL}/api/v1/sequences`, { cache: "no-store" });
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
    const res = await beeFetch(`${API_URL}/api/v1/sequences/executions?${query}`, { cache: "no-store" });
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
  const res = await beeFetch(`${API_URL}/api/v1/sequences/executions/${executionId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata: metadata ?? {} }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as AdvanceResult, live: true };
}

// ─── PsychographicAnalyzer ────────────────────────────────────────────────────

export async function getLeadDISCProfile(leadId: string): Promise<FetchResult<LeadPsychographic>> {
  if (isDemoMode()) {
    // Same title→DISC heuristic the real PsychographicAnalyzer runs — see
    // lib/demo/disc.ts's docstring for why this is a faithful JS port
    // rather than a fabricated score with no relationship to the lead.
    const lead = demoFetchLeads().find((l) => l.id === leadId);
    if (!lead) return { data: null as unknown as LeadPsychographic, live: false };
    const company = lead.company_id
      ? demoFetchCompanies().find((c) => c.id === lead.company_id)
      : undefined;
    return { data: demoClassifyLead(leadId, lead.title, company?.industry ?? null), live: false };
  }
  try {
    const res = await beeFetch(`${API_URL}/api/v1/psychographic/leads/${leadId}`, { cache: "no-store" });
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
  const res = await beeFetch(`${API_URL}/api/v1/psychographic/adapt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as AdaptedContent, live: true };
}

export async function listDISCProfiles(): Promise<FetchResult<LeadPsychographic[]>> {
  try {
    const res = await beeFetch(`${API_URL}/api/v1/psychographic/profiles`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as LeadPsychographic[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

// ─── DarkFunnelService ────────────────────────────────────────────────────────

const DEMO_TEMPERATURES_KEY = "bee.demo.hiveTemperatures.v1";

/** The sandbox's manual temperatures, one per hot lead id, in this browser. */
function readDemoTemperatures(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_TEMPERATURES_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * A person's override of one account's temperature, set from the hive —
 * 0–100, or null to follow BEE's computed score again. In the sandbox it
 * lives in this browser only, like every other demo edit.
 */
export async function setHotLeadTemperature(scoreId: string, manualTemperature: number | null): Promise<HotLeadScore> {
  if (isDemoMode()) {
    const overrides = readDemoTemperatures();
    if (manualTemperature === null) delete overrides[scoreId];
    else overrides[scoreId] = manualTemperature;
    try {
      window.localStorage.setItem(DEMO_TEMPERATURES_KEY, JSON.stringify(overrides));
    } catch {
      // Storage blocked — the optimistic update still shows the change.
    }
    const lead = getSampleHotLeads(getDemoLocale()).find((l) => l.id === scoreId);
    if (!lead) throw new Error("Hot lead not found.");
    return { ...lead, manual_temperature: manualTemperature };
  }
  const res = await beeFetch(`${API_URL}/api/v1/dark-funnel/hot-leads/${scoreId}/temperature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manual_temperature: manualTemperature }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return (await res.json()) as HotLeadScore;
}

export async function getDarkFunnelHotLeads(params?: {
  min_score?: number;
  buying_stage?: string;
  hot_only?: boolean;
  limit?: number;
}): Promise<FetchResult<HotLeadScore[]>> {
  if (isDemoMode()) {
    // Same sample hot leads getDarkFunnelSummary already aggregates from —
    // the hive (SignalHexMap) and the Dark Funnel dashboard's lead list
    // must show the same accounts the summary tiles above them count,
    // filtered the same way the real endpoint would.
    const overrides = readDemoTemperatures();
    let leads = getSampleHotLeads(getDemoLocale()).map((l) => (l.id in overrides ? { ...l, manual_temperature: overrides[l.id] } : l));
    if (params?.min_score !== undefined) {
      leads = leads.filter((l) => l.research_intensity_score >= params.min_score!);
    }
    if (params?.buying_stage) {
      leads = leads.filter((l) => l.buying_stage === params.buying_stage);
    }
    if (params?.hot_only) {
      leads = leads.filter((l) => l.is_hot);
    }
    if (params?.limit) {
      leads = leads.slice(0, params.limit);
    }
    return { data: leads, live: false };
  }
  try {
    const query = new URLSearchParams();
    if (params?.min_score !== undefined) query.set("min_score", String(params.min_score));
    if (params?.buying_stage) query.set("buying_stage", params.buying_stage);
    if (params?.hot_only) query.set("hot_only", "true");
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await beeFetch(`${API_URL}/api/v1/dark-funnel/hot-leads?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as HotLeadScore[], live: true };
  } catch {
    // Honest empty, not fabricated demo data — same convention as
    // fetchSignals (see its docstring in lib/api/signals.ts for the full
    // rationale). A real account hitting a transient failure must never
    // see illustrative companies ("Northwind Labs") rendered as if they
    // were real hot leads.
    return { data: [], live: false };
  }
}

export async function getDarkFunnelSummary(): Promise<FetchResult<DarkFunnelSummary | null>> {
  if (isDemoMode()) {
    // Computed from the same sample hot leads getDarkFunnelHotLeads already
    // falls back to — an honest aggregate of the data actually on screen,
    // not a separately invented number.
    const sampleHotLeads = getSampleHotLeads(getDemoLocale());
    const hot = sampleHotLeads.filter((l) => l.is_hot);
    const summary: DarkFunnelSummary = {
      total_signals_today: sampleHotLeads.reduce((sum, l) => sum + l.signal_count, 0),
      total_hot_leads: hot.length,
      ready_to_buy_count: sampleHotLeads.filter((l) => l.buying_stage === "ready_to_buy").length,
      decision_stage_count: sampleHotLeads.filter((l) => l.buying_stage === "decision").length,
      consideration_stage_count: sampleHotLeads.filter((l) => l.buying_stage === "consideration")
        .length,
      new_signals_today: hot.length,
      top_intent_signals: [...new Set(sampleHotLeads.flatMap((l) => l.top_intent_keywords))].slice(
        0,
        5,
      ),
    };
    return { data: summary, live: false };
  }
  try {
    const res = await beeFetch(`${API_URL}/api/v1/dark-funnel/summary`, { cache: "no-store" });
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
  if (isDemoMode()) throw new Error("Dark Funnel es de solo lectura en el sandbox.");
  const res = await beeFetch(`${API_URL}/api/v1/dark-funnel/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as DarkFunnelSignal, live: true };
}

// ─── NetworkNavigator ─────────────────────────────────────────────────────────

export async function getNetworkConnections(): Promise<FetchResult<NetworkConnection[]>> {
  if (isDemoMode()) return { data: demoFetchNetworkConnections(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/network/connections`, { cache: "no-store" });
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
  if (isDemoMode()) return { data: demoAddNetworkConnection(payload), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/network/connections`, {
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
  if (isDemoMode()) {
    return { data: demoFindIntroPaths({ target_domain: params.target_domain, target_company: params.target_company }), live: true };
  }
  try {
    const query = new URLSearchParams({ target_domain: params.target_domain });
    if (params.target_company) query.set("target_company", params.target_company);
    if (params.target_name) query.set("target_name", params.target_name);
    const res = await beeFetch(`${API_URL}/api/v1/network/paths?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as NetworkQueryResult, live: true };
  } catch {
    return { data: null as unknown as NetworkQueryResult, live: false };
  }
}

export async function getNetworkStats(): Promise<FetchResult<NetworkStats | null>> {
  if (isDemoMode()) return { data: demoNetworkStats(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/network/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as NetworkStats, live: true };
  } catch {
    return { data: null, live: false };
  }
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export async function getDLQSummary(): Promise<FetchResult<DLQSummary | null>> {
  if (isDemoMode()) return { data: demoDLQSummary(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/workflow/dlq/summary`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as DLQSummary, live: true };
  } catch {
    return { data: null, live: false };
  }
}

export async function getDLQEvents(params?: { status?: string; limit?: number }): Promise<FetchResult<FailedEvent[]>> {
  if (isDemoMode()) return { data: demoFetchDLQEvents(params), live: true };
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await beeFetch(`${API_URL}/api/v1/workflow/dlq?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as FailedEvent[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function retryDLQEvent(eventId: string): Promise<FetchResult<DLQRetryResult>> {
  if (isDemoMode()) return { data: demoRetryDLQEvent(eventId), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/workflow/dlq/${eventId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as DLQRetryResult, live: true };
}

export async function resolveDLQEvent(eventId: string, notes?: string): Promise<FetchResult<FailedEvent>> {
  if (isDemoMode()) return { data: demoResolveDLQEvent(eventId, notes), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/workflow/dlq/${eventId}/resolve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: (await res.json()) as FailedEvent, live: true };
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export async function getAuditSummary(): Promise<FetchResult<AuditSummary | null>> {
  if (isDemoMode()) return { data: demoAuditSummary(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/audit/summary`, { cache: "no-store" });
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
  if (isDemoMode()) return { data: demoRecordCorrection(data), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/learning/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

export async function getStyleProfile(): Promise<FetchResult<import("@/lib/types").StyleProfileOut | null>> {
  if (isDemoMode()) return { data: demoFetchStyleProfile(), live: true };
  try {
    const res = await beeFetch(`${API_URL}/api/v1/learning/style-profile`, { cache: "no-store" });
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
  if (isDemoMode()) {
    throw new Error("El simulador de escenarios corre sobre datos reales — no está en el sandbox.");
  }
  const res = await beeFetch(`${API_URL}/api/v1/analytics/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

// ─── Anomaly Detector ─────────────────────────────────────────────────────────

export async function getAnomalyAlerts(params?: { status?: string; severity?: string }): Promise<FetchResult<import("@/lib/types").AnomalyAlert[]>> {
  if (isDemoMode()) return { data: demoFetchAnomalyAlerts(params), live: true };
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.severity) query.set("severity", params.severity);
    const res = await beeFetch(`${API_URL}/api/v1/analytics/anomalies?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function checkAnomalies(): Promise<FetchResult<import("@/lib/types").AnomalyCheckResult>> {
  if (isDemoMode()) return { data: demoCheckAnomalies(), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/analytics/anomalies/check`, { method: "POST" });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return { data: await res.json(), live: true };
}

export async function acknowledgeAnomaly(alertId: string, notes?: string): Promise<FetchResult<import("@/lib/types").AnomalyAlert>> {
  if (isDemoMode()) return { data: demoAcknowledgeAnomaly(alertId, notes), live: true };
  const res = await beeFetch(`${API_URL}/api/v1/analytics/anomalies/${alertId}/acknowledge`, {
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
  if (isDemoMode()) return { data: demoFetchAuditDecisions(params), live: true };
  try {
    const query = new URLSearchParams();
    if (params?.agent_type) query.set("agent_type", params.agent_type);
    if (params?.manual_review_required !== undefined) query.set("manual_review_required", String(params.manual_review_required));
    if (params?.opportunity_id) query.set("opportunity_id", params.opportunity_id);
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await beeFetch(`${API_URL}/api/v1/audit/decisions?${query}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return { data: (await res.json()) as AuditEntry[], live: true };
  } catch {
    return { data: [], live: false };
  }
}
