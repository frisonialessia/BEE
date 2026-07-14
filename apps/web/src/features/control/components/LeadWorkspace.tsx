"use client";

import Link from "next/link";
import { ArrowUpRight, Flame, AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useLeadBoard } from "@/hooks/queries/use-lead-board";
import { scoreVariant } from "@/lib/format";
import { KANBAN_COLUMNS, groupLeadCards } from "@/lib/control/lead-board";
import { cn } from "@/lib/utils";
import type { LeadCard } from "@/types/control";
import { Badge } from "@/components/ui/badge";

function KanbanCard({ card }: { card: LeadCard }) {
  const channel = card.strategy?.channel;
  const pain = card.strategy?.pain_point;

  return (
    <Link
      href={`/dashboard/opportunities/${card.opportunity_id}`}
      className="block rounded-xl bg-[var(--bee-surface-primary)]/40 p-4 shadow-[var(--bee-shadow)] transition-shadow hover:shadow-[0_4px_20px_-4px_rgba(138,158,255,0.35)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-light leading-snug tracking-tight">
          {card.title}
        </p>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={scoreVariant(card.score)} className="font-mono text-[10px]">
          {Math.round(card.score)}
        </Badge>
        {card.hot_lead && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--bee-accent-hot)]">
            <Flame className="size-3" />
            Hot
          </span>
        )}
        {card.manual_review_required && (
          <AlertCircle className="size-3 text-[var(--bee-accent-warm)]" aria-label="Review required" />
        )}
      </div>
      {pain && (
        <p className="mt-2 line-clamp-2 text-[11px] font-light text-muted-foreground">
          {pain}
        </p>
      )}
      {channel && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          via {channel}
        </p>
      )}
    </Link>
  );
}

function KanbanColumn({
  label,
  cards,
}: {
  label: string;
  cards: LeadCard[];
}) {
  return (
    <div className="flex w-[min(100%,240px)] shrink-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">{cards.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 rounded-xl bg-muted/20 p-2 min-h-[120px]">
        {cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] font-light text-muted-foreground">
            —
          </p>
        ) : (
          cards.map((card) => (
            <div key={card.opportunity_id} className="group">
              <KanbanCard card={card} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * LeadWorkspace — Kanban for leads with BEE-generated closing strategies.
 * Auto-refreshes every 12s via TanStack Query.
 */
export function LeadWorkspace() {
  const { data: result, isLoading } = useLeadBoard(100);
  const cards = result?.cards ?? [];
  const grouped = groupLeadCards(cards);

  return (
    <section className="bee-surface min-h-[480px] p-6" aria-label="Lead workspace">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Lead Workspace
          </h2>
          <p className="mt-1 text-xs font-light text-muted-foreground">
            Strategies by pipeline stage · updates automatically
          </p>
        </div>
        {result?.live === false && (
          <span className="text-[10px] text-muted-foreground">Demo / offline</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-56 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className={cn("flex gap-4 overflow-x-auto pb-2")}>
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              label={col.label}
              cards={grouped[col.id] ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}
