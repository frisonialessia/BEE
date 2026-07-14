/**
 * Control dashboard types — ingestion pipeline, worker health, provider status.
 *
 * Mirrors:
 *   apps/api/app/schemas/external_webhook.py  → IngestionWorkerStatus
 *   apps/api/app/services/external_api/       → provider registry + rate limits
 *
 * Used by SystemHealth, SignalStream, and LeadWorkspace.
 */

import type { OpportunityStatus, Signal, StrategySchema } from "./domain";

// ── External providers ────────────────────────────────────────────────────────

export type ExternalProviderName =
  | "linkedin"
  | "g2"
  | "google_search"
  | "capterra"
  | string;

export type ProviderHealthState = "online" | "degraded" | "offline" | "mock";

/** Single external API provider (LinkedIn, G2, Google Search…). */
export interface ProviderStatus {
  name: ExternalProviderName;
  /** API credentials present (SecretManager). */
  configured: boolean;
  /** HMAC webhook secret configured for inbound events. */
  webhook_configured: boolean;
  rate_limit_per_hour: number;
  /** Derived client-side from rate_limits + configured flags. */
  health: ProviderHealthState;
  tokens_remaining: number;
  tokens_capacity: number;
}

// ── Ingestion worker ─────────────────────────────────────────────────────────

export interface RateLimitBucket {
  tokens_remaining: number;
  capacity: number;
}

/** Raw payload from GET /api/v1/webhooks/status */
export interface IngestionWorkerStatus {
  running: boolean;
  queue_depth: number;
  processed_count: number;
  error_count: number;
  providers: Array<{
    name: string;
    configured: boolean;
    webhook_configured: boolean;
    rate_limit_per_hour: number;
  }>;
  rate_limits: Record<string, RateLimitBucket>;
}

export interface WorkerHealth {
  running: boolean;
  queue_depth: number;
  processed_count: number;
  error_count: number;
  /** 0–100 — load indicator derived from queue depth. */
  load_pct: number;
  state: "idle" | "busy" | "stopped" | "error";
}

// ── API connectivity ─────────────────────────────────────────────────────────

export interface ApiConnectivity {
  live: boolean;
  environment: string | null;
  db_ready: boolean;
  service: string | null;
}

/** Aggregated snapshot for SystemHealth widget. */
export interface SystemHealthSnapshot {
  connectivity: ApiConnectivity;
  worker: WorkerHealth;
  providers: ProviderStatus[];
  fetched_at: string;
}

// ── Signal pipeline (SignalStream) ────────────────────────────────────────────

export type SignalPipelineStage =
  | "webhook"
  | "ingestion"
  | "enrichment"
  | "strategy"
  | "ready";

export interface SignalPipelineEvent {
  id: string;
  signal_id: string | null;
  opportunity_id: string | null;
  stage: SignalPipelineStage;
  title: string;
  provider: ExternalProviderName | null;
  score: number | null;
  timestamp: string;
  /** Human-readable stage label for the feed. */
  label: string;
}

// ── Lead workspace (Kanban) ───────────────────────────────────────────────────

export type LeadColumnId =
  | "detected"
  | "enriching"
  | "ready_to_action"
  | "in_progress"
  | "closed";

export interface LeadCard {
  opportunity_id: string;
  signal_id: string | null;
  title: string;
  company_name: string | null;
  lead_name: string | null;
  score: number;
  status: OpportunityStatus;
  column: LeadColumnId;
  strategy: Partial<StrategySchema> | null;
  hot_lead: boolean;
  manual_review_required: boolean;
  updated_at: string;
}

/** Strategy alias for workspace display. */
export type Strategy = StrategySchema;

/** Re-export core domain types consumed by the control UI. */
export type { Signal, StrategySchema };
