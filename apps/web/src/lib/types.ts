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

export interface Battlecard {
  opportunity_id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  ready_to_action: boolean;
  hot_lead: boolean;  // true when BehavioralCollector detects buying intent
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
