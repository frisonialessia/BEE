"use client";

import { AlertCircle, ArrowUpRight, Flame, Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES, groupByCrmStage } from "@/lib/crm-board";
import { scoreVariant } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import type { Opportunity } from "@/types/domain";

const CHART_ACCENT: Record<CrmStage, string> = {
  detected: "bee-kanban-card--chart-3",
  ready_to_action: "bee-kanban-card--chart-6",
  prioritized: "bee-kanban-card--chart-1",
  in_progress: "bee-kanban-card--chart-4",
};

function CrmCard({
  opportunity,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  opportunity: Opportunity;
  dragging: boolean;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}) {
  const strategy = opportunity.strategy;
  const channel = strategy?.channel;
  const nextAction = strategy?.next_best_action;
  const isHot = Boolean((strategy as Record<string, unknown> | undefined)?.hot_lead);
  const reviewRequired = Boolean(strategy?.manual_review_required);
  const accent = CHART_ACCENT[opportunity.status as CrmStage] ?? "";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, opportunity.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(opportunity.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(opportunity.id);
      }}
      className={cn(
        "bee-kanban-card group w-full cursor-grab text-left active:cursor-grabbing",
        accent,
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
          {opportunity.title.replace(/^Opportunity:\s*/, "")}
        </p>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={scoreVariant(opportunity.score)} className="font-mono text-[10px]">
          {Math.round(opportunity.score)}
        </Badge>
        {isHot && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            Caliente
          </span>
        )}
        {reviewRequired && (
          <AlertCircle className="size-3 text-[var(--color-chart-1)]" aria-label="Requiere revisión" />
        )}
      </div>

      {typeof nextAction === "string" && nextAction && (
        <p className="mt-2 line-clamp-1 text-[11px] font-medium text-muted-foreground">
          {nextAction.replace(/_/g, " ")}
        </p>
      )}
      {typeof channel === "string" && channel && (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">vía {channel}</p>
      )}
    </div>
  );
}

function CrmColumn({
  stage,
  label,
  cards,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  stage: CrmStage;
  label: string;
  cards: Opportunity[];
  draggingId: string | null;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (stage: CrmStage) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div className="flex w-[min(100%,280px)] shrink-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="bee-eyebrow">{label}</h3>
        <span className="font-mono text-[10px] text-muted-foreground">{cards.length}</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop(stage);
        }}
        className={cn(
          "flex min-h-[220px] flex-1 flex-col gap-2.5 rounded-[var(--radius-lg)] border-2 border-dashed border-transparent bg-[var(--color-primary)]/25 p-2.5 transition-colors",
          over && "border-[var(--color-chart-4)] bg-[var(--color-chart-4)]/10",
        )}
      >
        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-8 text-center">
            <Inbox className="size-4 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">Sin oportunidades aquí</p>
            <p className="text-[10px] text-muted-foreground">Arrastra una tarjeta para moverla</p>
          </div>
        ) : (
          cards.map((opp) => (
            <CrmCard
              key={opp.id}
              opportunity={opp}
              dragging={draggingId === opp.id}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** CRM — el pipeline real, separado de "Oportunidades" (que se queda con
 *  battlecards y el flujo agregado). Arrastra una tarjeta entre etapas
 *  abiertas; ganar/perder sigue siendo una acción dedicada en el drawer
 *  (MEDDIC, razón de pérdida, competidor), nunca un simple drop — "Cerradas"
 *  es de solo lectura a propósito. */
export function CrmBoard() {
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { openOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const opportunities = oppsResult?.data ?? [];
  const live = oppsResult?.live ?? false;
  const { stages, closed } = groupByCrmStage(opportunities);

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  function handleDrop(stage: CrmStage) {
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const current = opportunities.find((o) => o.id === id);
    if (!current || current.status === stage) return;

    moveStage.mutate(
      { id, stage },
      {
        onError: (err) => {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "No se pudo mover la oportunidad — intenta de nuevo.",
          );
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-[280px] shrink-0 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <Inbox className="mx-auto mb-2 size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Todavía no hay oportunidades en el pipeline.</p>
        <p className="bee-caption mt-1">En cuanto una señal se convierta en oportunidad, aparece aquí.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="bee-caption">Arrastra una tarjeta para moverla de etapa</p>
        <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {CRM_STAGES.map((s) => (
          <CrmColumn
            key={s.id}
            stage={s.id}
            label={s.label}
            cards={stages[s.id]}
            draggingId={draggingId}
            onOpen={openOpportunity}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        ))}

        {/* Cerradas — solo lectura, ganar/perder es una acción dedicada, no un drop. */}
        <div className="flex w-[min(100%,280px)] shrink-0 flex-col">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h3 className="bee-eyebrow">Cerradas</h3>
            <span className="font-mono text-[10px] text-muted-foreground">{closed.length}</span>
          </div>
          <div className="flex min-h-[220px] flex-1 flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-block-muted)] p-2.5">
            {closed.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-8 text-center">
                <p className="text-[11px] text-muted-foreground">Nada cerrado todavía</p>
              </div>
            ) : (
              closed.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => openOpportunity(opp.id)}
                  className={cn(
                    "bee-kanban-card group w-full text-left opacity-70 transition-opacity hover:opacity-100",
                    opp.status === "won" ? "bee-kanban-card--chart-6" : "",
                  )}
                >
                  <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
                    {opp.title.replace(/^Opportunity:\s*/, "")}
                  </p>
                  <Badge
                    variant={opp.status === "won" ? "success" : "secondary"}
                    className="mt-2 text-[10px]"
                  >
                    {opp.status === "won" ? "Ganada" : opp.status === "lost" ? "Perdida" : "Descartada"}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
