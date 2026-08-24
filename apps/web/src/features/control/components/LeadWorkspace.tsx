"use client";

import { ArrowRight, Flame, KanbanSquare } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { useLeadBoard } from "@/hooks/queries/use-lead-board";
import { KANBAN_COLUMNS, groupLeadCards } from "@/lib/control/lead-board";

const STAGE_LABEL_ES: Record<string, string> = {
  detected: "Detectadas",
  enriching: "Enriqueciendo",
  ready_to_action: "Listas",
  in_progress: "En progreso",
  closed: "Cerradas",
};

/** Espacio de leads — resumen compacto del pipeline (no un Kanban completo:
 *  ese es el trabajo dedicado de CRM, con drag-and-drop real). Esto es
 *  "cuántas hay en cada etapa, de un vistazo" + un salto directo a
 *  trabajarlas. Evita el problema de columnas vacías con solo un guion que
 *  tenía la versión anterior — mismo dato (useLeadBoard), presentación
 *  honesta a su verdadero peso en esta pantalla de 3 columnas. */
export function LeadWorkspace() {
  const { data: result, isLoading } = useLeadBoard(100);
  const cards = result?.cards ?? [];
  const grouped = groupLeadCards(cards);
  const hotCount = cards.filter((c) => c.hot_lead).length;

  return (
    <section className="bee-surface flex h-full min-h-0 flex-col p-5" aria-label="Espacio de leads">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">Zona de acción</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">Espacio de leads</h2>
        </div>
        {result?.live === false && (
          <span className="bee-micro">Demo / offline</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-[var(--radius-md)]" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <KanbanSquare className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sin señales activas en el pipeline todavía.</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          {KANBAN_COLUMNS.map((col) => {
            const count = (grouped[col.id] ?? []).length;
            return (
              <div
                key={col.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-primary)]/25 px-3 py-2.5"
              >
                <span className="text-xs font-medium">{STAGE_LABEL_ES[col.id] ?? col.label}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
              </div>
            );
          })}
          {hotCount > 0 && (
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--color-chart-5)]">
              <Flame className="size-3" />
              {hotCount} lead{hotCount === 1 ? "" : "s"} caliente{hotCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      <Link
        href="/dashboard/crm"
        className="bee-btn-ghost mt-4 w-full shrink-0 justify-center text-xs"
      >
        Abrir CRM
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
