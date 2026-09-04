// ── PriorityFeedService (Bandeja de Decisiones) ──────────────────────────────

export type DecisionKind = "opportunity" | "anomaly";
export type DecisionUrgency = "low" | "medium" | "high";
export type RecommendedAction = "call" | "email" | "review" | "wait" | "pause";
/** Structured "why" — translated client-side (decision-feed.tsx `reasons.*`);
 *  `headline`/`reasoning` remain the server's Spanish rendering as a fallback. */
export type DecisionReasonCode =
  | "pending_approval"
  | "hot_lead"
  | "cycle_overdue"
  | "in_pipeline"
  | "anomaly";

export interface DecisionCard {
  id: string;
  kind: DecisionKind;
  company_name: string | null;
  headline: string;
  reasoning: string;
  urgency: DecisionUrgency;
  recommended_action: RecommendedAction;
  reason_code?: DecisionReasonCode;
  reason_params?: Record<string, string | number | null>;
  opportunity_id: string | null;
  pending_action_id: string | null;
  score: number;
}

export interface TodayFeedOut {
  cards: DecisionCard[];
  generated_at: string;
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
  loss_reason: string | null;
  competitor: string | null;
  closed_at: string;
  message: string;
  already_recorded: boolean;
  resource_prediction: ResourcePrediction | null;
  workflow_tasks_dispatched: number;
}

// ── CyclePredictorService ─────────────────────────────────────────────────────

export type CyclePredictionConfidence = "low" | "medium" | "high";

/** Whether a NEW market signal on the same company, detected while a deal
 *  was open, historically correlates with a faster or slower close —
 *  independent of, and additive to, the base cycle prediction (never
 *  blended into `predicted_cycle_days`). See CyclePredictorService's
 *  module docstring (backend) / lib/cycle-prediction.ts (its JS port) for
 *  the full rationale — including why this is very often `available:
 *  false` on a small or young account, honestly, rather than a guess. */
export interface CycleSignalRecalibration {
  available: boolean;
  reason: string | null;
  with_signal_median_days: number | null;
  with_signal_count: number;
  without_signal_median_days: number | null;
  without_signal_count: number;
  delta_days: number | null;
  target_has_new_signal: boolean;
  target_new_signal_types: string[];
}

/** Predicted time-to-close for one open opportunity, from GET
 *  /opportunities/{id}/cycle-prediction (or its JS port in lib/cycle-prediction.ts
 *  for /probar). `available=false` is a normal, expected response — not an
 *  error — for a closed opportunity or one with no comparable historical
 *  cohort yet; `reason` explains why, and every other field stays null
 *  rather than a fabricated number. */
export interface CyclePrediction {
  available: boolean;
  predicted_cycle_days: number | null;
  predicted_close_date: string | null;
  days_elapsed: number | null;
  days_remaining: number | null;
  is_overdue: boolean;
  cohort_size: number;
  cohort_basis: string | null;
  confidence: CyclePredictionConfidence | null;
  reason: string | null;
  signal_recalibration: CycleSignalRecalibration | null;
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

// ── PersonalBrandService ───────────────────────────────────────────────────────

export interface VoiceProfile {
  id: string;
  display_name: string;
  title: string | null;
  language: string;
  tone_descriptors: string[];
  authority_topics: string[];
  forbidden_phrases: string[];
  max_sentence_words: number;
  use_emojis: boolean;
  preferred_cta: string | null;
  bio_summary: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A proposed VoiceProfile draft from pasted writing samples — never
 * persisted by itself. The caller reviews/edits the fields and still
 * submits them through the normal create-profile call to save one. */
export interface VoiceProfileExtractResult {
  title: string | null;
  tone_descriptors: string[];
  authority_topics: string[];
  forbidden_phrases: string[];
  preferred_cta: string | null;
  bio_summary: string | null;
  generated_by: "llm" | "heuristic" | "demo";
  model_used: string | null;
}

/** A live, on-demand side-by-side: generic AI output vs. this org's own
 * voice, for the same topic. Never persisted. */
export interface BrandVoicePreviewResult {
  topic: string;
  generic_version: string;
  branded_version: string;
  generated_by: "llm" | "template" | "demo";
  model_used: string | null;
}

export interface BrandFragment {
  id: string;
  profile_id: string;
  content: string;
  category: string;
  tags: string[];
  source: string | null;
  performance_score: number | null;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface BrandContextResult {
  voice_profile: VoiceProfile | null;
  relevant_fragments: BrandFragment[];
  brand_brief: string;
  fragment_count_total: number;
}

export interface ChannelStatus {
  channel: string;
  authenticated: boolean;
  mock: boolean;
  tokens_remaining: number | null;
  rate_limit: {
    requests_per_day: number;
    requests_per_hour: number;
    min_interval_seconds: number;
  };
}

// ── SmartEngagementEngine ─────────────────────────────────────────────────────

export type EngagementSentiment = "positive" | "neutral" | "negative" | "question" | "unknown";
export type EngagementIntent =
  | "sales_interest"
  | "objection"
  | "referral"
  | "follow_up"
  | "compliment"
  | "spam"
  | "other";

export interface EngagementEvent {
  id: string;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  content: string;
  sentiment: EngagementSentiment;
  intent: EngagementIntent;
  analysis_confidence: number;
  analysis_notes: string | null;
  response_draft: string | null;
  pending_action_id: string | null;
  processed: boolean;
  ignored: boolean;
  created_at: string;
}

export interface EngagementAnalysis extends EngagementEvent {
  event_id: string;
}

// ── DynamicSequenceEngine ─────────────────────────────────────────────────────

export type SequenceStatus = "draft" | "active" | "paused" | "archived";
export type ExecutionStatus = "running" | "waiting" | "paused" | "completed" | "failed" | "cancelled";

export interface StepTransition {
  condition: string;
  next_step_id: string | null;
  delay_days: number;
}

export interface StepDefinition {
  id: string;
  name: string;
  action: string;
  artifact_type: string | null;
  channel: string | null;
  transitions: StepTransition[];
  fallback_step_id: string | null;
  max_wait_days: number;
  notes: string | null;
}

export interface DynamicSequence {
  id: string;
  name: string;
  description: string | null;
  signal_type: string | null;
  industry: string | null;
  entry_step_id: string;
  steps: StepDefinition[];
  max_days: number;
  status: SequenceStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SequenceExecution {
  id: string;
  sequence_id: string;
  opportunity_id: string | null;
  lead_id: string | null;
  current_step_id: string;
  status: ExecutionStatus;
  events: Array<{ event: string; timestamp: string; metadata: Record<string, unknown> }>;
  pending_action_ids: string[];
  started_at: string;
  last_advanced_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AdvanceResult {
  execution_id: string;
  previous_step: string;
  current_step: string | null;
  status: ExecutionStatus;
  transition_triggered: string | null;
  pending_action_created: boolean;
  message: string;
}

// ─── Psychology & Network Intelligence ────────────────────────────────────────

export type DISCStyle = "D" | "I" | "S" | "C" | "UNKNOWN";
export type BuyingStage = "awareness" | "consideration" | "decision" | "ready_to_buy";
export type IntroType = "warm_intro" | "referral" | "alumni" | "cold";

export interface LeadPsychographic {
  id: string;
  lead_id: string;
  d_score: number;
  i_score: number;
  s_score: number;
  c_score: number;
  dominant_style: DISCStyle;
  secondary_style: DISCStyle | null;
  confidence: number;
  preferred_tone: string;
  preferred_message_length: string;
  avoid_phrases: string[];
  classification_source: string;
  classification_notes: string | null;
  classified_at: string;
  created_at: string;
}

export interface AdaptedContent {
  original: string;
  adapted: string;
  disc_style: DISCStyle;
  adaptations_applied: string[];
  confidence: number;
  artifact_type: string;
}

export interface DarkFunnelSignal {
  id: string;
  company_domain: string;
  company_name: string | null;
  signal_type: string;
  source_platform: string | null;
  intent_keywords: string[];
  anonymous: boolean;
  weight: number;
  processed: boolean;
  created_at: string;
}

export interface HotLeadScore {
  id: string;
  company_domain: string;
  company_name: string | null;
  lead_id: string | null;
  research_intensity_score: number;
  buying_stage: BuyingStage;
  signal_count: number;
  signal_types_seen: string[];
  top_intent_keywords: string[];
  last_signal_at: string | null;
  is_hot: boolean;
  hot_since: string | null;
  alerted: boolean;
  /** A person's override (0–100) set from the hive; null = as BEE computed it. */
  manual_temperature: number | null;
  created_at: string;
}

export interface DarkFunnelSummary {
  total_signals_today: number;
  total_hot_leads: number;
  ready_to_buy_count: number;
  decision_stage_count: number;
  consideration_stage_count: number;
  new_signals_today: number;
  top_intent_signals: string[];
}

export interface NetworkConnection {
  id: string;
  contact_name: string;
  contact_company: string;
  contact_domain: string;
  contact_title: string | null;
  connection_type: string;
  relationship_strength: number;
  notes: string | null;
  tags: string[];
  industries: string[];
  interaction_count: number;
  active: boolean;
  created_at: string;
}

export interface IntroStep {
  person: string;
  company: string;
  relationship_to_next: string;
  strength: number;
}

export interface IntroPath {
  target_name: string | null;
  target_company: string;
  target_domain: string;
  path_length: number;
  intro_type: IntroType;
  strength_score: number;
  connector_name: string | null;
  connector_id: string | null;
  steps: IntroStep[];
  action_recommendation: string;
  draft_ask: string | null;
}

export interface NetworkQueryResult {
  target_company: string;
  target_domain: string;
  paths_found: IntroPath[];
  best_path: IntroPath | null;
  cold_outreach_fallback: boolean;
  network_coverage: "none" | "weak" | "moderate" | "strong";
}

export interface NetworkStats {
  total_connections: number;
  first_degree_count: number;
  second_degree_count: number;
  top_industries: string[];
  avg_relationship_strength: number;
  companies_covered: number;
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export type DLQStatus = "pending" | "retrying" | "resolved" | "permanently_failed";

export interface FailedEvent {
  id: string;
  event_type: string;
  event_name: string;
  opportunity_id: string | null;
  lead_id: string | null;
  pending_action_id: string | null;
  attempt_count: number;
  last_error: string | null;
  error_history: Array<{ attempt: number; error: string; timestamp: string }>;
  status: DLQStatus;
  next_retry_at: string | null;
  last_attempted_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  ceo_alerted: boolean;
  created_at: string;
}

export interface DLQSummary {
  total_events: number;
  pending_count: number;
  retrying_count: number;
  resolved_count: number;
  permanently_failed_count: number;
  due_for_retry_count: number;
  ceo_alerted_count: number;
}

export interface DLQRetryResult {
  event_id: string;
  success: boolean;
  status: DLQStatus;
  message: string;
  attempt_count: number;
  next_retry_at: string | null;
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  agent_type: string;
  decision_type: string;
  session_id: string | null;
  opportunity_id: string | null;
  lead_id: string | null;
  signal_id: string | null;
  pending_action_id: string | null;
  context_snapshot: Record<string, unknown>;
  market_data_used: Record<string, unknown>;
  strategy_reasoning: string | null;
  output_snapshot: Record<string, unknown>;
  confidence_score: number;
  manual_review_required: boolean;
  processing_ms: number | null;
  generator_name: string | null;
  generator_version: string | null;
  created_at: string;
}

export interface AuditSummary {
  total_entries: number;
  manual_review_count: number;
  avg_confidence_score: number;
  entries_by_agent: Record<string, number>;
  entries_by_decision: Record<string, number>;
}

// ─── Correction Learning ──────────────────────────────────────────────────────

export interface CorrectionOut {
  correction_id: string;
  artifact_type: string;
  diff_ops: Array<{ type: string; content: string; detail: string; ratio?: number }>;
  extracted_rules: string[];
  change_ratio: number;
  style_summary: string;
  authoritative_rules_count: number;
  total_corrections: number;
  profile_version: number;
}

export interface StyleProfileOut {
  total_corrections: number;
  authoritative_rules_count: number;
  style_summary: string;
  profile_version: number;
  last_correction_at: string | null;
  rules_by_type: Record<string, Record<string, { weight: number; count: number; authoritative: boolean }>>;
}

// ─── Scenario Simulator ───────────────────────────────────────────────────────

export interface ScenarioVariant {
  label: string;
  win_rate: number;
  monthly_wins: number;
  monthly_revenue: number;
  quarterly_revenue: number;
  annual_revenue: number;
}

export interface ScenarioResult {
  scenario_id: string;
  sector: string | null;
  signal_type: string | null;
  channel: string | null;
  psychographic_style: string | null;
  base_win_rate: number;
  effective_win_rate: number;
  channel_modifier: number;
  disc_modifier: number;
  signal_modifier: number;
  dark_funnel_modifier: number;
  target_monthly_signals: number;
  adjusted_monthly_signals: number;
  avg_deal_value: number;
  median_cycle_days: number;
  conservative: ScenarioVariant;
  realistic: ScenarioVariant;
  optimistic: ScenarioVariant;
  key_drivers: string[];
  risk_factors: string[];
  recommended_actions: string[];
  historical_sample_size: number;
  low_data_confidence: boolean;
  // False when this organization has zero closed StrategyOutcome records of
  // any kind — every number below (win rates, avg deal value, and all three
  // projections) is an industry-benchmark estimate, not anything measured
  // from this tenant's own pipeline. Distinct from low_data_confidence,
  // which can still be true with real (just sparse) data.
  has_any_historical_data: boolean;
  // Honesty flags surfaced from ScenarioSimulator._get_historical_stats —
  // True means avg_deal_value/median_cycle_days is an assumed industry
  // default, not a measurement from this org's own closed deals.
  supporting_data: {
    used_default_deal_value?: boolean;
    used_default_cycle_days?: boolean;
    [key: string]: unknown;
  };
}

// ─── Anomaly Detector ─────────────────────────────────────────────────────────

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "acted_upon" | "dismissed" | "auto_resolved";

export interface AnomalyAlert {
  id: string;
  alert_type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  segment_type: string;
  segment_value: string | null;
  rolling_rate: number;
  baseline_rate: number;
  deviation_pct: number;
  sample_size: number;
  title: string;
  description: string;
  recommendation: string;
  suggested_actions: string[];
  pending_action_id: string | null;
  acknowledged_at: string | null;
  resolution_notes: string | null;
  auto_resolved: boolean;
  created_at: string;
}

export interface AnomalyCheckResult {
  checked_at: string;
  new_alerts: AnomalyAlert[];
  resolved_alerts: AnomalyAlert[];
  open_alerts: AnomalyAlert[];
  summary: string;
  checked_segments: number;
}

// ── AccountResearchAgent ──────────────────────────────────────────────────────

export interface AccountBrief {
  id: string;
  company_id: string;
  summary: string;
  findings: Record<string, unknown>;
  sources: string[];
  generated_by: string;
  model_used: string | null;
  created_at: string;
}

export interface AccountResearchResult {
  brief: AccountBrief | null;
  from_cache: boolean;
  budget_exceeded: boolean;
  disabled: boolean;
}
