/**
 * Shared domain types for the BEE frontend.
 *
 * These mirror the backend's API contract (see `apps/api/app/schemas/signal.py`)
 * so the UI and API stay in sync. Keeping them in one place makes the data model
 * explicit and refactor-safe.
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
  | "prioritized"
  | "in_progress"
  | "won"
  | "lost"
  | "dismissed";

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
