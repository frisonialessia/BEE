import type { CrmStage } from "@/lib/api/opportunities";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "@/types/domain";

/** One BEE tone per stage — the board's card fills and column bars, the
 *  opportunities list's stage dots, all read from here so a stage looks
 *  the same everywhere. Won is deliberately the brand blue on white ("a
 *  client", not a colored stage); lost/dismissed are neutral. */
export const STAGE_TONE: Record<OpportunityStatus, { fill: string; bar: string }> = {
  detected: { fill: "bee-kanban-card--fill-3", bar: "var(--color-chart-3)" },
  ready_to_action: { fill: "bee-kanban-card--fill-6", bar: "var(--color-chart-6)" },
  prioritized: { fill: "bee-kanban-card--fill-1", bar: "var(--color-chart-1)" },
  in_progress: { fill: "bee-kanban-card--fill-4", bar: "var(--color-chart-4)" },
  won: { fill: "bee-kanban-card--client", bar: "var(--color-chart-4)" },
  lost: { fill: "bee-kanban-card--muted", bar: "var(--color-divider)" },
  dismissed: { fill: "bee-kanban-card--muted", bar: "var(--color-divider)" },
};

// `label` below is a fallback only — every render site pulls the real,
// localized copy via t(`stages.${id}`) (see messages/{es,en}/crm.json's
// board.stages/stageSubtitles/stageHelp) so it can carry the fuller
// subtitle + explainer text a bare id/label pair can't hold.
export const CRM_STAGES: { id: CrmStage; label: string }[] = [
  { id: "detected", label: "Nuevas" },
  { id: "ready_to_action", label: "Listas para actuar" },
  { id: "prioritized", label: "Tu prioridad" },
  { id: "in_progress", label: "En conversación" },
];

/** Agrupa por etapa REAL (`Opportunity.status`), no por una columna derivada
 *  — en un Kanban en el que las tarjetas se arrastran, la columna donde vive
 *  una tarjeta tiene que ser exactamente la etapa a la que se movería si se
 *  soltara ahí mismo, sin ambigüedad. Ganadas/perdidas/descartadas van
 *  aparte, en `closed` — cerrar un deal sigue siendo una acción dedicada
 *  (con MEDDIC, razón de pérdida, competidor), nunca un simple drop. */
export function groupByCrmStage(opportunities: Opportunity[]): {
  stages: Record<CrmStage, Opportunity[]>;
  closed: Opportunity[];
} {
  const stages = Object.fromEntries(CRM_STAGES.map((s) => [s.id, [] as Opportunity[]])) as Record<
    CrmStage,
    Opportunity[]
  >;
  const closed: Opportunity[] = [];

  for (const opp of opportunities) {
    if (CLOSED_OPPORTUNITY_STATUSES.includes(opp.status)) {
      closed.push(opp);
      continue;
    }
    const stage = stages[opp.status as CrmStage];
    if (stage) stage.push(opp);
  }

  for (const s of CRM_STAGES) {
    stages[s.id].sort((a, b) => b.score - a.score);
  }
  closed.sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

  return { stages, closed };
}
