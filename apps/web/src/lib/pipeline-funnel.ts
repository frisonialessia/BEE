/**
 * Embudo del pipeline — 4 etapas hacia el cierre (Detectada → Battlecard
 * listo → En curso → Ganada), con conversión entre etapas. El KPI strip de
 * Resumen ya muestra estos 4 números sueltos; esto los conecta: cuánto se
 * cae de una etapa a la siguiente, no solo cuánto hay en cada bucket.
 *
 * Deliberadamente no reconstruye "cuántas oportunidades pasaron alguna vez
 * por esta etapa" — BEE no guarda un historial de transiciones de status,
 * así que inventar ese número sería fabricar un dato que no existe. Cada
 * etapa es un snapshot honesto: cuántas oportunidades están HOY en ese
 * status. "Perdida" queda fuera a propósito — ya tiene su propia vista
 * completa en Ganado/Perdido; duplicarla aquí no aporta.
 */
import type { Opportunity } from "@/types/domain";

export interface FunnelStage {
  key: "detected" | "ready_to_action" | "in_progress" | "won";
  count: number;
  /** % del total de oportunidades en estas 4 etapas (nunca de "Detectada" —
   * ese bucket es chico y transitorio por naturaleza, así que un % contra
   * él se lee como un error aunque sea matemáticamente correcto). Siempre
   * entre 0-100%, y las 4 etapas suman 100%. null si no hay ninguna
   * oportunidad en estas 4 etapas todavía. */
  shareOfPipeline: number | null;
  /** Timestamps ISO para la sparkline de 7 días — created_at en la primera
   * etapa, updated_at como proxy honesto en las demás (BEE no guarda por
   * separado "cuándo entró a este status"; ver el mismo patrón ya usado en
   * dashboard-overview.tsx para readyTrend/hotLeadsTrend). */
  timestamps: string[];
}

// Labels live with the component, not here (see PipelineFunnel in
// components/dashboard/pipeline-funnel.tsx) — this is a plain utility
// function, not a component, so it has no access to useTranslations().
// Hardcoding Spanish text here is exactly what left this funnel's stage
// badges untranslated in EN even on pages where everything around them
// correctly switched language.
const STAGE_KEYS: FunnelStage["key"][] = ["detected", "ready_to_action", "in_progress", "won"];

export function computeFunnelStages(opportunities: Opportunity[]): FunnelStage[] {
  const byStage = STAGE_KEYS.map((key) => ({
    key,
    matching: opportunities.filter((o) => o.status === key),
  }));
  const total = byStage.reduce((sum, s) => sum + s.matching.length, 0);

  return byStage.map(({ key, matching }) => ({
    key,
    count: matching.length,
    shareOfPipeline: total === 0 ? null : matching.length / total,
    timestamps: matching.map((o) => (key === "detected" ? o.created_at : o.updated_at)),
  }));
}
