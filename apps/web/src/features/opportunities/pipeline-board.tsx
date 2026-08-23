"use client";

import { ArrowUpRight, Flame, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { KANBAN_COLUMNS, groupLeadCards, opportunityToLeadCard } from "@/lib/control/lead-board";
import { scoreVariant } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LeadCard, LeadColumnId } from "@/types/control";
import type { Opportunity } from "@/types/domain";

/** Etiquetas en español para las columnas del pipeline — mismos IDs que Control. */
const COLUMN_LABELS: Record<LeadColumnId, string> = {
  detected: "Detectadas",
  enriching: "Enriqueciendo",
  ready_to_action: "Listas para actuar",
  in_progress: "En progreso",
  closed: "Cerradas",
};

const CHART_ACCENT = [
  "",
  "bee-kanban-card--chart-2",
  "bee-kanban-card--chart-3",
  "bee-kanban-card--chart-4",
  "bee-kanban-card--chart-5",
  "bee-kanban-card--chart-6",
] as const;

function PipelineCard({
  card,
  index,
  onOpen,
}: {
  card: LeadCard;
  index: number;
  onOpen: (id: string) => void;
}) {
  const channel = card.strategy?.channel;
  const nextAction = card.strategy?.next_best_action;
  const isWon = card.status === "won";
  const isClosedOut = card.status === "lost" || card.status === "dismissed";

  // Ganada/perdida se notan de inmediato por color, no solo por texto.
  const accent = isWon
    ? "border-l-[var(--color-success)]"
    : isClosedOut
      ? "border-l-[var(--color-text-muted)] opacity-70"
      : CHART_ACCENT[index % CHART_ACCENT.length];

  return (
    <button
      type="button"
      onClick={() => onOpen(card.opportunity_id)}
      className={cn("bee-kanban-card group w-full text-left", accent)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
          {card.title}
        </p>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={isWon ? "success" : isClosedOut ? "secondary" : scoreVariant(card.score)} className="font-mono text-[10px]">
          {Math.round(card.score)}
        </Badge>
        {card.hot_lead && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            Caliente
          </span>
        )}
        {card.manual_review_required && (
          <AlertCircle className="size-3 text-[var(--color-chart-1)]" aria-label="Requiere revisión" />
        )}
      </div>

      {typeof nextAction === "string" && nextAction && (
        <p className="mt-2 line-clamp-1 text-[11px] font-medium text-muted-foreground">
          {nextAction.replace(/_/g, " ")}
        </p>
      )}
      {typeof channel === "string" && channel && (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          vía {channel}
        </p>
      )}
    </button>
  );
}

function PipelineColumn({
  id,
  cards,
  onOpen,
}: {
  id: LeadColumnId;
  cards: LeadCard[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex w-[min(100%,272px)] shrink-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="bee-eyebrow">{COLUMN_LABELS[id]}</h3>
        <span className="font-mono text-[10px] text-muted-foreground">{cards.length}</span>
      </div>
      <div className="flex min-h-[160px] flex-1 flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-primary)]/25 p-2.5">
        {cards.length === 0 ? (
          <p className="px-2 py-8 text-center text-[11px] font-light text-muted-foreground">
            Sin oportunidades
          </p>
        ) : (
          cards.map((card, i) => (
            <PipelineCard key={card.opportunity_id} card={card} index={i} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

/** Pipeline real por etapa — mismas columnas que la Zona de Acción de Control. */
export function PipelineBoard({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[];
  onOpen: (id: string) => void;
}) {
  const cards = opportunities.map(opportunityToLeadCard);
  const grouped = groupLeadCards(cards);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((col) => (
        <PipelineColumn key={col.id} id={col.id} cards={grouped[col.id] ?? []} onOpen={onOpen} />
      ))}
    </div>
  );
}
