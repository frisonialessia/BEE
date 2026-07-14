"use client";

import { ArrowUpRight, Flame, AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useLeadBoard } from "@/hooks/queries/use-lead-board";
import { scoreVariant } from "@/lib/format";
import { KANBAN_COLUMNS, groupLeadCards } from "@/lib/control/lead-board";
import { cn } from "@/lib/utils";
import type { LeadCard } from "@/types/control";
import { Badge } from "@/components/ui/badge";

const CHART_ACCENT = [
  "",
  "bee-kanban-card--chart-2",
  "bee-kanban-card--chart-3",
  "bee-kanban-card--chart-4",
  "bee-kanban-card--chart-5",
  "bee-kanban-card--chart-6",
] as const;

function KanbanCard({
  card,
  index,
  onOpen,
}: {
  card: LeadCard;
  index: number;
  onOpen: (id: string) => void;
}) {
  const channel = card.strategy?.channel;
  const pain = card.strategy?.pain_point;
  const accent = CHART_ACCENT[index % CHART_ACCENT.length];

  return (
    <button
      type="button"
      onClick={() => onOpen(card.opportunity_id)}
      className={cn(
        "bee-kanban-card group w-full text-left",
        accent,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
          {card.title}
        </p>
        <ArrowUpRight className="size-3.5 shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={scoreVariant(card.score)} className="font-mono text-[10px]">
          {Math.round(card.score)}
        </Badge>
        {card.hot_lead && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            Hot
          </span>
        )}
        {card.manual_review_required && (
          <AlertCircle className="size-3 text-[var(--color-chart-1)]" aria-label="Review required" />
        )}
      </div>
      {pain && (
        <p className="mt-2 line-clamp-2 text-[11px] font-light text-[var(--color-text-muted)]">
          {pain}
        </p>
      )}
      {channel && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          via {channel}
        </p>
      )}
    </button>
  );
}

function KanbanColumn({
  label,
  cards,
  onOpen,
}: {
  label: string;
  cards: LeadCard[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex w-[min(100%,260px)] shrink-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="bee-eyebrow">{label}</h3>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{cards.length}</span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-2xl bg-[var(--color-primary)]/25 p-2.5">
        {cards.length === 0 ? (
          <p className="px-2 py-8 text-center text-[11px] font-light text-[var(--color-text-muted)]">—</p>
        ) : (
          cards.map((card, i) => (
            <KanbanCard key={card.opportunity_id} card={card} index={i} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

/** LeadWorkspace — primary CRM action column (Kanban). */
export function LeadWorkspace() {
  const { data: result, isLoading } = useLeadBoard(100);
  const { openOpportunity } = useOpportunityDrawer();
  const cards = result?.cards ?? [];
  const grouped = groupLeadCards(cards);

  return (
    <section className="bee-surface flex h-full min-h-0 flex-col p-5" aria-label="Lead workspace">
      <div className="mb-4 flex shrink-0 items-end justify-between gap-4">
        <div>
          <h2 className="bee-eyebrow">Action Zone</h2>
          <p className="bee-kpi-sm mt-1">Lead Workspace</p>
        </div>
        {result?.live === false && (
          <span className="text-[10px] text-[var(--color-text-muted)]">Demo / offline</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
        {isLoading ? (
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-56 shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="flex h-full gap-4">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                label={col.label}
                cards={grouped[col.id] ?? []}
                onOpen={openOpportunity}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
