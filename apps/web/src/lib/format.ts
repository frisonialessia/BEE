import type { OpportunityStatus, SignalType } from "@/lib/types";

/** Human-readable labels for signal types (single source of truth for the UI). */
export const signalTypeLabels: Record<SignalType, string> = {
  funding_round: "Funding round",
  hiring: "Hiring",
  tech_adoption: "Tech adoption",
  leadership_change: "Leadership change",
  product_launch: "Product launch",
  engagement: "Engagement",
  news_mention: "News mention",
  expansion: "Expansion",
  other: "Other",
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  detected: "Detected",
  prioritized: "Prioritized",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
};

/** Map a 0-100 score to a semantic badge variant for consistent color coding. */
export function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "secondary";
}

/** Compact relative-time formatter (e.g. "42m ago", "3h ago"). */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
