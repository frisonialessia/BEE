import type { Locale } from "@/i18n/locales";
import { defaultLocale } from "@/i18n/locales";
import type { OpportunityStatus, SignalType, TimingUrgency } from "@/lib/types";
import type { LeadStatus, LossReason, OpportunityType } from "@/types/domain";

const SIGNAL_TYPE_LABELS_ES: Record<SignalType, string> = {
  funding_round: "Ronda de financiación",
  hiring: "Contratación",
  tech_adoption: "Adopción de tecnología",
  leadership_change: "Cambio de liderazgo",
  product_launch: "Lanzamiento de producto",
  engagement: "Engagement",
  news_mention: "Mención en prensa",
  expansion: "Expansión",
  franchise_expansion: "Expansión de franquicias",
  merger_acquisition: "Fusión / adquisición",
  public_tender: "Licitación pública",
  regulatory_change: "Cambio regulatorio",
  funding_grant: "Fondo / subvención",
  other: "Otra",
};

const SIGNAL_TYPE_LABELS_EN: Record<SignalType, string> = {
  funding_round: "Funding round",
  hiring: "Hiring",
  tech_adoption: "Tech adoption",
  leadership_change: "Leadership change",
  product_launch: "Product launch",
  engagement: "Engagement",
  news_mention: "Press mention",
  expansion: "Expansion",
  franchise_expansion: "Franchise expansion",
  merger_acquisition: "Merger / acquisition",
  public_tender: "Public tender",
  regulatory_change: "Regulatory change",
  funding_grant: "Funding grant",
  other: "Other",
};

/** Locale-aware version of `signalTypeLabels` — call with the visitor's
 *  locale (from `useLocale()`) instead of importing a static dict. */
export function getSignalTypeLabels(locale: Locale = defaultLocale): Record<SignalType, string> {
  return locale === "en" ? SIGNAL_TYPE_LABELS_EN : SIGNAL_TYPE_LABELS_ES;
}

/** @deprecated Use `getSignalTypeLabels(locale)` instead — this static
 *  export always renders Spanish. Kept only for any caller not yet
 *  migrated. */
export const signalTypeLabels = SIGNAL_TYPE_LABELS_ES;

/** signal.analysis.tags — the keyword an analyzer matched in the raw signal
 * text (funding/hiring/tech_adoption analyzers), shown as small chips on
 * each SignalCard. The keywords themselves stay in English in the backend
 * on purpose — they're matched against real external signal text (funding/
 * hiring APIs, etc.), which is typically English, so translating them there
 * would break detection. This is the display-only translation for the
 * chip; an unrecognized tag (e.g. a free-form `event_type` from a
 * behavioral/engagement signal) falls back to showing the raw value. */
const SIGNAL_TAG_LABELS_ES: Record<string, string> = {
  funding: "financiamiento",
  raised: "levantó capital",
  "series a": "serie A",
  "series b": "serie B",
  "series c": "serie C",
  "seed round": "ronda semilla",
  venture: "capital de riesgo",
  investment: "inversión",
  hiring: "contratación",
  "job opening": "vacante",
  "new role": "nuevo puesto",
  "we're hiring": "contratando",
  headcount: "headcount",
  "vp of": "vp de",
  "head of": "líder de",
  chief: "director",
  adopted: "adoptó",
  "migrated to": "migró a",
  "now using": "ahora usa",
  "integration with": "integración con",
  stack: "stack",
  tech: "tecnología",
  behavioral: "comportamiento",
  intent: "intención",
  unclassified: "sin clasificar",
};

const SIGNAL_TAG_LABELS_EN: Record<string, string> = {
  funding: "funding",
  raised: "raised",
  "series a": "series A",
  "series b": "series B",
  "series c": "series C",
  "seed round": "seed round",
  venture: "venture capital",
  investment: "investment",
  hiring: "hiring",
  "job opening": "job opening",
  "new role": "new role",
  "we're hiring": "we're hiring",
  headcount: "headcount",
  "vp of": "VP of",
  "head of": "head of",
  chief: "chief",
  adopted: "adopted",
  "migrated to": "migrated to",
  "now using": "now using",
  "integration with": "integration with",
  stack: "stack",
  tech: "tech",
  behavioral: "behavioral",
  intent: "intent",
  unclassified: "unclassified",
};

/** Locale-aware version of `signalTagLabels`. */
export function getSignalTagLabels(locale: Locale = defaultLocale): Record<string, string> {
  return locale === "en" ? SIGNAL_TAG_LABELS_EN : SIGNAL_TAG_LABELS_ES;
}

/** @deprecated Use `getSignalTagLabels(locale)` instead. */
export const signalTagLabels = SIGNAL_TAG_LABELS_ES;

const OPPORTUNITY_STATUS_LABELS_ES: Record<OpportunityStatus, string> = {
  detected: "Detectada",
  ready_to_action: "Lista para acción",
  prioritized: "Priorizada",
  in_progress: "En progreso",
  won: "Ganada",
  lost: "Perdida",
  dismissed: "Descartada",
};

const OPPORTUNITY_STATUS_LABELS_EN: Record<OpportunityStatus, string> = {
  detected: "Detected",
  ready_to_action: "Ready to action",
  prioritized: "Prioritized",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
};

/** Locale-aware version of `opportunityStatusLabels`. */
export function getOpportunityStatusLabels(
  locale: Locale = defaultLocale,
): Record<OpportunityStatus, string> {
  return locale === "en" ? OPPORTUNITY_STATUS_LABELS_EN : OPPORTUNITY_STATUS_LABELS_ES;
}

/** @deprecated Use `getOpportunityStatusLabels(locale)` instead. */
export const opportunityStatusLabels = OPPORTUNITY_STATUS_LABELS_ES;

// ── Revenue Continuity Radar: opportunity_type ──────────────────────────────

const OPPORTUNITY_TYPE_LABELS_ES: Record<OpportunityType, string> = {
  new_logo: "Cliente nuevo",
  expansion: "Expansión",
  renewal_risk: "Riesgo de renovación",
};

const OPPORTUNITY_TYPE_LABELS_EN: Record<OpportunityType, string> = {
  new_logo: "New logo",
  expansion: "Expansion",
  renewal_risk: "Renewal risk",
};

export function getOpportunityTypeLabels(
  locale: Locale = defaultLocale,
): Record<OpportunityType, string> {
  return locale === "en" ? OPPORTUNITY_TYPE_LABELS_EN : OPPORTUNITY_TYPE_LABELS_ES;
}

/** "new_logo" is the default/majority case — a neutral outline badge, not
 * a color competing with the status badge next to it. "expansion" is a
 * positive signal (success/green); "renewal_risk" needs to stand out
 * (warning/amber) since missing it in a list view is exactly the failure
 * this whole feature exists to prevent. */
export function opportunityTypeVariant(type: OpportunityType): "outline" | "success" | "warning" {
  if (type === "expansion") return "success";
  if (type === "renewal_risk") return "warning";
  return "outline";
}

// The three title prefixes SignalEngine._create_opportunity writes — see
// app.services.signal_engine.engine's _OPPORTUNITY_TITLE_PREFIXES. Every
// view that displays an opportunity's title strips it (the status/type
// badges next to the title already carry that information — showing it
// twice is redundant), so this is the one place that prefix list is typed
// out, instead of eight independent copies of the same regex drifting.
const OPPORTUNITY_TITLE_PREFIX_RE = /^(Opportunity|Expansion opportunity|Renewal risk|Oportunidad|Oportunidad de expansión|Riesgo de renovación):\s*/i;

export function stripOpportunityTitlePrefix(title: string): string {
  return title.replace(OPPORTUNITY_TITLE_PREFIX_RE, "");
}

const URGENCY_LABELS_ES: Record<TimingUrgency, string> = {
  immediate: "Contactar de inmediato",
  this_week: "Contactar esta semana",
  this_month: "Contactar este mes",
  watch: "Monitorear",
};

const URGENCY_LABELS_EN: Record<TimingUrgency, string> = {
  immediate: "Contact immediately",
  this_week: "Contact this week",
  this_month: "Contact this month",
  watch: "Monitor",
};

/** Locale-aware version of `urgencyLabels`. */
export function getUrgencyLabels(locale: Locale = defaultLocale): Record<TimingUrgency, string> {
  return locale === "en" ? URGENCY_LABELS_EN : URGENCY_LABELS_ES;
}

/** @deprecated Use `getUrgencyLabels(locale)` instead. */
export const urgencyLabels = URGENCY_LABELS_ES;

export const urgencyColors: Record<TimingUrgency, string> = {
  immediate: "text-[var(--success)]",
  this_week: "text-[var(--warning)]",
  this_month: "text-muted-foreground",
  watch: "text-muted-foreground",
};

const LEAD_STATUS_LABELS_ES: Record<LeadStatus, string> = {
  new: "Nuevo",
  qualified: "Calificado",
  engaged: "En conversación",
  converted: "Convertido",
  disqualified: "Descartado",
};

const LEAD_STATUS_LABELS_EN: Record<LeadStatus, string> = {
  new: "New",
  qualified: "Qualified",
  engaged: "In conversation",
  converted: "Converted",
  disqualified: "Disqualified",
};

/** Locale-aware version of `leadStatusLabels`. */
export function getLeadStatusLabels(locale: Locale = defaultLocale): Record<LeadStatus, string> {
  return locale === "en" ? LEAD_STATUS_LABELS_EN : LEAD_STATUS_LABELS_ES;
}

/** @deprecated Use `getLeadStatusLabels(locale)` instead. */
export const leadStatusLabels = LEAD_STATUS_LABELS_ES;

/** Picklist fijo de razones de pérdida (app.schemas.feedback.LossReason en el backend). */
const LOSS_REASON_LABELS_ES: Record<LossReason, string> = {
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

const LOSS_REASON_LABELS_EN: Record<LossReason, string> = {
  price: "Price",
  budget: "No budget",
  timing: "Bad timing",
  competitor: "Chose a competitor",
  no_decision: "No decision (status quo)",
  lost_champion: "Lost internal champion",
  product_fit: "Product didn't fit",
  no_response: "Stopped responding",
  other: "Other reason",
};

/** Locale-aware version of `lossReasonLabels`. */
export function getLossReasonLabels(locale: Locale = defaultLocale): Record<LossReason, string> {
  return locale === "en" ? LOSS_REASON_LABELS_EN : LOSS_REASON_LABELS_ES;
}

/** @deprecated Use `getLossReasonLabels(locale)` instead. */
export const lossReasonLabels = LOSS_REASON_LABELS_ES;

/** Banderas que arma DataValidator en el backend. */
const VALIDATION_FLAG_LABELS_ES: Record<string, string> = {
  email_missing: "Sin email",
  email_invalid: "Email inválido",
  linkedin_invalid: "LinkedIn inválido",
  title_missing: "Sin cargo",
  stale_data: "Datos desactualizados",
  seniority_mismatch: "Cargo y seniority no coinciden",
  name_too_short: "Nombre incompleto",
};

const VALIDATION_FLAG_LABELS_EN: Record<string, string> = {
  email_missing: "No email",
  email_invalid: "Invalid email",
  linkedin_invalid: "Invalid LinkedIn",
  title_missing: "No title",
  stale_data: "Stale data",
  seniority_mismatch: "Title/seniority mismatch",
  name_too_short: "Incomplete name",
};

/** Locale-aware version of `validationFlagLabels`. */
export function getValidationFlagLabels(locale: Locale = defaultLocale): Record<string, string> {
  return locale === "en" ? VALIDATION_FLAG_LABELS_EN : VALIDATION_FLAG_LABELS_ES;
}

/** @deprecated Use `getValidationFlagLabels(locale)` instead. */
export const validationFlagLabels = VALIDATION_FLAG_LABELS_ES;

export function scoreVariant(score: number): "success" | "warning" | "secondary" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "secondary";
}

/** Same ≥75/≥50 thresholds as scoreVariant(), as a CSS color instead of a
 *  Badge variant — for the handful of places that paint a score directly
 *  (bars, dots, raw text) instead of rendering a <Badge>. Score/"hot"
 *  coloring used to be reimplemented independently in half a dozen spots
 *  with three different thresholds and four different "hot" colors
 *  (magenta, orange, amber, gold) — this is the one function every one of
 *  them should call instead of picking their own. */
export function scoreColorVar(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--color-text-muted)";
}
