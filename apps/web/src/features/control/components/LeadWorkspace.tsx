"use client";

import { ArrowRight, Flame, KanbanSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useLeadBoard } from "@/hooks/queries/use-lead-board";
import { KANBAN_COLUMNS, groupLeadCards } from "@/lib/control/lead-board";
import { LiveBadge } from "@/components/live-badge";

/** Espacio de leads — resumen compacto del pipeline (no un Kanban completo:
 *  ese es el trabajo dedicado de CRM, con drag-and-drop real). Esto es
 *  "cuántas hay en cada etapa, de un vistazo" + un salto directo a
 *  trabajarlas. Evita el problema de columnas vacías con solo un guion que
 *  tenía la versión anterior — mismo dato (useLeadBoard), presentación
 *  honesta a su verdadero peso en esta pantalla de 3 columnas. */
export function LeadWorkspace() {
  const t = useTranslations("probarNetworkBrandControl.control.leadWorkspace");
  const { data: result, isLoading } = useLeadBoard(100);
  const cards = result?.cards ?? [];
  const grouped = groupLeadCards(cards);
  const hotCount = cards.filter((c) => c.hot_lead).length;

  return (
    // h-full: this card is one of three equal-height siblings in the grid's
    // top row (see ControlLayout/globals.css) — every sibling in that row
    // stretches to the row's own (compact) height by design. The stage-rows
    // list below already carries flex-1, so the extra room this card gains
    // pushes "Abrir CRM" to the bottom instead of leaving a gap past it.
    <section className="bee-surface flex h-full min-h-0 flex-col bee-bento-pad" aria-label={t("ariaLabel")}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 bee-card-title">{t("title")}</h2>
        </div>
        <LiveBadge live={result?.live !== false} hideLive />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-[var(--radius-md)]" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <KanbanSquare className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          {KANBAN_COLUMNS.map((col) => {
            const count = (grouped[col.id] ?? []).length;
            return (
              <div
                key={col.id}
                className="bee-bento flex items-center justify-between gap-4 px-3 py-3"
              >
                <span className="text-xs font-medium">{t(`stages.${col.id}`)}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
              </div>
            );
          })}
          {hotCount > 0 && (
            <p className="flex items-center gap-2 pt-1 text-micro text-[var(--color-chart-5)]">
              <Flame className="size-3" />
              {t("hotLeads", { count: hotCount })}
            </p>
          )}
        </div>
      )}

      <Link
        href="/dashboard/crm"
        className="bee-btn-ghost mt-4 w-full shrink-0 justify-center text-xs"
      >
        {t("openCrm")}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
