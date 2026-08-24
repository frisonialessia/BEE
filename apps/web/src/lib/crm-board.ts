import type { CrmStage } from "@/lib/api/opportunities";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity } from "@/types/domain";

export const CRM_STAGES: { id: CrmStage; label: string }[] = [
  { id: "detected", label: "Detectadas" },
  { id: "ready_to_action", label: "Listas para actuar" },
  { id: "prioritized", label: "Priorizadas" },
  { id: "in_progress", label: "En progreso" },
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
