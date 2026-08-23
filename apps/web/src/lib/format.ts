import type { OpportunityStatus, SignalType, TimingUrgency } from "@/lib/types";
import type { LeadStatus } from "@/types/domain";

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
  ready_to_action: "Ready to action",
  prioritized: "Prioritized",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
};

export const urgencyLabels: Record<TimingUrgency, string> = {
  immediate: "Contact immediately",
  this_week: "Contact this week",
  this_month: "Contact this month",
  watch: "Monitor",
};

export const urgencyColors: Record<TimingUrgency, string> = {
  immediate: "text-[var(--success)]",
  this_week: "text-[var(--warning)]",
  this_month: "text-muted-foreground",
  watch: "text-muted-foreground",
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Nuevo",
  qualified: "Calificado",
  engaged: "En conversación",
  converted: "Convertido",
  disqualified: "Descartado",
};

/** Etiquetas en español para las banderas que arma DataValidator en el backend. */
export const validationFlagLabels: Record<string, string> = {
  email_missing: "Sin email",
  email_invalid: "Email inválido",
  linkedin_invalid: "LinkedIn inválido",
  title_missing: "Sin cargo",
  stale_data: "Datos desactualizados",
  seniority_mismatch: "Cargo y seniority no coinciden",
  name_too_short: "Nombre incompleto",
};

export function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "secondary";
}

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
