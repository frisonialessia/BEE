import type { OpportunityStatus, SignalType, TimingUrgency } from "@/lib/types";
import type { LeadStatus, LossReason } from "@/types/domain";

export const signalTypeLabels: Record<SignalType, string> = {
  funding_round: "Ronda de financiación",
  hiring: "Contratación",
  tech_adoption: "Adopción de tecnología",
  leadership_change: "Cambio de liderazgo",
  product_launch: "Lanzamiento de producto",
  engagement: "Engagement",
  news_mention: "Mención en prensa",
  expansion: "Expansión",
  other: "Otra",
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  detected: "Detectada",
  ready_to_action: "Lista para acción",
  prioritized: "Priorizada",
  in_progress: "En progreso",
  won: "Ganada",
  lost: "Perdida",
  dismissed: "Descartada",
};

export const urgencyLabels: Record<TimingUrgency, string> = {
  immediate: "Contactar de inmediato",
  this_week: "Contactar esta semana",
  this_month: "Contactar este mes",
  watch: "Monitorear",
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

/** Etiquetas en español para el picklist fijo de razones de pérdida
 *  (app.schemas.feedback.LossReason en el backend). */
export const lossReasonLabels: Record<LossReason, string> = {
  price: "Precio",
  budget: "Sin presupuesto",
  timing: "Momento no oportuno",
  competitor: "Eligieron a un competidor",
  no_decision: "No hubo decisión (statu quo)",
  lost_champion: "Se perdió al champion interno",
  product_fit: "No encajó el producto",
  no_response: "Dejó de responder",
  other: "Otra razón",
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
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return `hace ${days}d`;
}
