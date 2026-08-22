/**
 * Master domain types — canonical contract shared with the BEE API.
 *
 * Mirrors `apps/api/app/schemas/signal.py` and `strategy.py`.
 * Import from `@/types` (or `@/types/domain`) — never duplicate shapes elsewhere.
 */

// ── Enums (match Python StrEnum values) ─────────────────────────────────────

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

export type SignalSource =
  | "webhook"
  | "manual"
  | "scraper"
  | "integration"
  | "dark_funnel";

export type OpportunityStatus =
  | "detected"
  | "ready_to_action"
  | "prioritized"
  | "in_progress"
  | "won"
  | "lost"
  | "dismissed";

export type TimingUrgency = "immediate" | "this_week" | "this_month" | "watch";

// ── Inbound webhook refs (SignalWebhookIn) ───────────────────────────────────

export interface CompanyRef {
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  country?: string | null;
}

export interface LeadRef {
  full_name?: string | null;
  email?: string | null;
  title?: string | null;
  seniority?: string | null;
  linkedin_url?: string | null;
}

// ── SignalOut ─────────────────────────────────────────────────────────────────

export interface Signal {
  id: string;
  signal_type: SignalType;
  source: SignalSource | string;
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

// ── StrategySchema (Opportunity.strategy JSON column) ─────────────────────────

export interface TimingWindow {
  urgency: TimingUrgency;
  reason: string;
  expires_at: string | null;
}

/** Fully-typed strategy contract — required for READY_TO_ACTION battlecards. */
export interface StrategySchema {
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
  confidence_score: number;
  manual_review_required: boolean;
  variant_id: string | null;
  variant_arm: string | null;
}

/** Partial strategy while opportunity is still being enriched. */
export type StrategyPartial = Partial<StrategySchema> & Record<string, unknown>;

// ── OpportunityOut ────────────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  strategy: StrategyPartial;
  signal_id: string | null;
  lead_id: string | null;
  company_id: string | null;
}

// ── SignalIngestResult ────────────────────────────────────────────────────────

export interface SignalIngestResult {
  signal: Signal;
  opportunity: Opportunity | null;
  analyzers_applied: string[];
  strategy_enriched: boolean;
  message: string;
}

// ── BattlecardOut ─────────────────────────────────────────────────────────────

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

/** Alias — battlecard strategy is always fully typed StrategySchema. */
export type BattlecardStrategy = StrategySchema;

export interface Battlecard {
  opportunity_id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  ready_to_action: boolean;
  hot_lead: boolean;
  manual_review_required: boolean;
  company: BattlecardCompany;
  lead: BattlecardLead;
  signal: BattlecardSignal;
  strategy: BattlecardStrategy;
  created_at: string;
  updated_at: string;
}

// ── Execution artifacts (ExecutiveAgent) ──────────────────────────────────────

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

// ── LeadOut ───────────────────────────────────────────────────────────────────

export type LeadStatus = "new" | "qualified" | "engaged" | "converted" | "disqualified";

export interface Lead {
  id: string;
  company_id: string | null;
  organization_id: string | null;
  assigned_to_user_id: string | null;
  full_name: string;
  email: string | null;
  title: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  phone: string | null;
  status: LeadStatus;
  score: number;
  attributes: Record<string, unknown>;
}
