/**
 * Shared domain types for the BEE frontend.
 *
 * These mirror the backend's API contract (see `apps/api/app/schemas/`) so
 * the UI and API stay in sync. Single source of truth for all domain shapes.
 */

export type SignalType =
  | "funding_round"
  | "hiring"
  | "tech_adoption"
  | "leadership_change"
  | "product_launch"
  | "engagement"
  | "news_mention"
  | "expansion"
  | "other";

export type OpportunityStatus =
  | "detected"
  | "ready_to_action"   // battlecard complete — engine cleared this for action
  | "prioritized"
  | "in_progress"
  | "won"
  | "lost"
  | "dismissed";

export type TimingUrgency = "immediate" | "this_week" | "this_month" | "watch";

export interface Signal {
  id: string;
  signal_type: SignalType;
  source: string;
  title: string;
  description: string | null;
  score: number;
  confidence: number;
  detected_at: string;
  company_id: string | null;
  lead_id: string | null;
  analysis: Record<string, unknown> & {
    tags?: string[];
    analyzers?: string[];
    primary_analyzer?: string;
  };
}

export interface Opportunity {
  id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  strategy: Record<string, unknown> & {
    playbook?: string;
    next_best_action?: string;
    channel?: string;
    rationale?: string;
  };
  signal_id: string | null;
  lead_id: string | null;
  company_id: string | null;
}

// ── Battlecard (fully enriched CEO brief) ────────────────────────────────────

export interface TimingWindow {
  urgency: TimingUrgency;
  reason: string;
  expires_at: string | null;
}

export interface BattlecardCompany {
  name: string | null;
  domain: string | null;
  industry: string | null;
  country: string | null;
}

export interface BattlecardLead {
  full_name: string | null;
  title: string | null;
  email: string | null;
  seniority: string | null;
  linkedin_url: string | null;
}

export interface BattlecardSignal {
  id: string;
  signal_type: string;
  title: string;
  description: string | null;
  score: number;
  detected_at: string;
  tags: string[];
}

export interface BattlecardStrategy {
  pain_point: string;
  closing_argument: string;
  timing_window: TimingWindow;
  playbook: string;
  next_best_action: string;
  channel: string;
  rationale: string | null;
  generator: string;
  generator_version: string;
  generated_at: string;
  /** 0-1 confidence score set by ObservabilityService */
  confidence_score: number;
  /** True when confidence_score < 0.80 — CEO must review before execution */
  manual_review_required: boolean;
  variant_id: string | null;
  variant_arm: string | null;
}

export interface Battlecard {
  opportunity_id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  ready_to_action: boolean;
  hot_lead: boolean;
  /** True when confidence < 0.80 — show warning badge */
  manual_review_required: boolean;
  company: BattlecardCompany;
  lead: BattlecardLead;
  signal: BattlecardSignal;
  strategy: BattlecardStrategy;
  created_at: string;
  updated_at: string;
}

// ── Execution Artifacts (ExecutiveAgent output) ───────────────────────────────

export interface EmailDraftArtifact {
  artifact_type: "email_draft";
  subject: string;
  body: string;
  ps_line: string | null;
  recommended_send_time: string | null;
  estimated_read_time_seconds: number;
}

export interface AgendaItem {
  duration_minutes: number;
  title: string;
  notes: string | null;
}

export interface MeetingStructureArtifact {
  artifact_type: "meeting_structure";
  meeting_title: string;
  total_duration_minutes: number;
  objective: string;
  agenda_items: AgendaItem[];
  pre_meeting_prep: string[];
  success_criteria: string;
}

export interface ActionItem {
  action: string;
  owner: "rep" | "lead" | "both";
  timing: string;
  priority: "high" | "medium" | "low";
}

export interface NextStepsArtifact {
  artifact_type: "next_steps";
  horizon: string;
  actions: ActionItem[];
  key_risk: string | null;
  success_milestone: string | null;
}

export interface ArtifactBundle {
  opportunity_id: string;
  generated_at: string;
  generator: string;
  email_draft: EmailDraftArtifact;
  meeting_structure: MeetingStructureArtifact;
  next_steps: NextStepsArtifact;
  context_snapshot: Record<string, unknown>;
}

// ── Feedback (FeedbackLoopService) ────────────────────────────────────────────

export interface OutcomeIn {
  outcome: "won" | "lost";
  notes?: string;
}

export interface OutcomeOut {
  opportunity_id: string;
  outcome: string;
  closed_at: string;
  message: string;
}

// ── AgentOrchestrator ─────────────────────────────────────────────────────────

export type ActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed";

export type ActionType =
  | "send_email"
  | "book_meeting"
  | "crm_update"
  | "slack_notify"
  | "linkedin_message"
  | "webhook_call";

export interface PendingAction {
  id: string;
  opportunity_id: string;
  action_type: ActionType;
  status: ActionStatus;
  title: string;
  description: string | null;
  preview: string | null;
  payload: Record<string, unknown>;
  priority: number;
  retry_count: number;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrchestratorStatus {
  total_pending: number;
  total_approved: number;
  total_executing: number;
  total_completed: number;
  total_failed: number;
  total_rejected: number;
}

// ── MarketInsights (TrendAnalyst) ─────────────────────────────────────────────

export type InsightType =
  | "volume_spike"
  | "sector_momentum"
  | "emerging_pattern"
  | "competitive_cluster"
  | "seasonal_trend";

export interface MarketInsight {
  id: string;
  insight_type: InsightType;
  signal_type: string | null;
  industry: string | null;
  title: string;
  description: string;
  tactical_implication: string | null;
  confidence: number;
  evidence_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

// ── A/B Tactic Variants ───────────────────────────────────────────────────────

export type VariantStatus = "active" | "paused" | "concluded";

export interface TacticVariant {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  signal_type: string;
  industry: string | null;
  arm_a_config: Record<string, unknown>;
  arm_b_config: Record<string, unknown>;
  traffic_split: number;
  min_samples_per_arm: number;
  status: VariantStatus;
  winner_arm: string | null;
  arm_a_wins: number;
  arm_a_total: number;
  arm_b_wins: number;
  arm_b_total: number;
  arm_a_win_rate: number;
  arm_b_win_rate: number;
  is_ready_to_conclude: boolean;
  created_at: string;
}

// ── ResourcePredictor ─────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export interface ResourcePrediction {
  risk_level: RiskLevel;
  capacity_impact_score: number;
  warnings: string[];
  recommended_actions: string[];
  blocks_confirmation: boolean;
  summary: string;
}

export interface OutcomeWithPrediction {
  opportunity_id: string;
  outcome: "won" | "lost";
  closed_at: string;
  message: string;
  resource_prediction: ResourcePrediction | null;
  workflow_tasks_dispatched: number;
}

// ── WorkflowOrchestrator (event bus) ──────────────────────────────────────────

export type WorkflowTaskStatus =
  | "pending"
  | "dispatched"
  | "mock_dispatched"
  | "completed"
  | "failed"
  | "skipped";

export interface WorkflowTask {
  id: string;
  event_type: string;
  entity_id: string | null;
  handler_name: string;
  status: WorkflowTaskStatus;
  mock: boolean;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  dispatched_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface WorkflowStatus {
  total_tasks: number;
  dispatched: number;
  mock_dispatched: number;
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
}

// ── RevenueSimulator ──────────────────────────────────────────────────────────

export interface SimulatorScenario {
  label: string;
  multiplier: number;
  prospecting_increase_factor: number;
  projected_new_pipeline: number;
  projected_won_deals: number;
  uplift_vs_baseline: number;
}

export interface RevenueSimulation {
  signal_type: string;
  industry: string | null;
  increase_factor: number;
  current_pipeline_count: number;
  historical_win_rate: number;
  data_confidence: "none" | "low" | "medium" | "high";
  sample_size: number;
  baseline_expected_won: number;
  scenarios: SimulatorScenario[];
  top_playbook: string | null;
  top_channel: string | null;
  recommendation: string;
  disclaimer: string;
}

// ── Behavioral intent (BehavioralCollector) ────────────────────────────────────

export type BehavioralEventType =
  | "page_visit"
  | "resource_download"
  | "demo_request"
  | "pricing_view"
  | "case_study_view"
  | "webinar_attendance"
  | "product_trial"
  | "repeat_visit";

export interface IntentEventResult {
  signal_id: string;
  opportunity_id: string | null;
  hot_lead: boolean;
  score: number;
  message: string;
}
