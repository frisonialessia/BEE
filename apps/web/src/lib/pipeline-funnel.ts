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
  label: string;
  count: number;
  /** % del conteo de la primera etapa (Detectada). null en la primera etapa. */
  conversionFromFirst: number | null;
  /** Timestamps ISO para la sparkline de 7 días — created_at en la primera
   * etapa, updated_at como proxy honesto en las demás (BEE no guarda por
   * separado "cuándo entró a este status"; ver el mismo patrón ya usado en
   * dashboard-overview.tsx para readyTrend/hotLeadsTrend). */
  timestamps: string[];
}

const STAGES: { key: FunnelStage["key"]; label: string }[] = [
  { key: "detected", label: "Detectada" },
  { key: "ready_to_action", label: "Battlecard listo" },
  { key: "in_progress", label: "En curso" },
  { key: "won", label: "Ganada" },
];

export function computeFunnelStages(opportunities: Opportunity[]): FunnelStage[] {
  const firstCount = opportunities.filter((o) => o.status === "detected").length;

  return STAGES.map(({ key, label }) => {
    const matching = opportunities.filter((o) => o.status === key);
    return {
      key,
      label,
      count: matching.length,
      conversionFromFirst: key === "detected" || firstCount === 0 ? null : matching.length / firstCount,
      timestamps: matching.map((o) => (key === "detected" ? o.created_at : o.updated_at)),
    };
  });
}
