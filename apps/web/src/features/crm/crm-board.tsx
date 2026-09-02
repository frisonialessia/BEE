"use client";

import { AlertCircle, ArrowUpRight, CircleHelp, Flame, Inbox } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { NewOpportunityForm } from "@/features/crm/new-opportunity-form";
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES, groupByCrmStage } from "@/lib/crm-board";
import {
  getOpportunityTypeLabels,
  opportunityTypeVariant,
  scoreVariant,
  stripOpportunityTitlePrefix,
} from "@/lib/format";
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
  onMove,
}: {
  opportunity: Opportunity;
  dragging: boolean;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onMove: (id: string, stage: CrmStage) => void;
}) {
  const t = useTranslations("crm.board");
  const locale = useLocale() as Locale;
  const strategy = opportunity.strategy;
  const channel = strategy?.channel;
  const nextAction = strategy?.next_best_action;
  const isHot = Boolean((strategy as Record<string, unknown> | undefined)?.hot_lead);
  const reviewRequired = Boolean(strategy?.manual_review_required);
  const accent = CHART_ACCENT[opportunity.status as CrmStage] ?? "";
  const opportunityType = opportunity.opportunity_type ?? "new_logo";
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);

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
          {stripOpportunityTitlePrefix(opportunity.title)}
        </p>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={scoreVariant(opportunity.score)} className="font-mono text-[11px]">
          {Math.round(opportunity.score)}
        </Badge>
        {opportunityType !== "new_logo" && (
          <Badge variant={opportunityTypeVariant(opportunityType)} className="text-[11px]">
            {opportunityTypeLabels[opportunityType]}
          </Badge>
        )}
        {isHot && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-chart-5)]">
            <Flame className="size-3" />
            {t("hot")}
          </span>
        )}
        {reviewRequired && (
          <AlertCircle className="size-3 text-[var(--color-chart-1)]" aria-label={t("reviewRequired")} />
        )}
      </div>

      {typeof nextAction === "string" && nextAction && (
        <p className="mt-2 line-clamp-1 bee-micro font-medium">
          {nextAction.replace(/_/g, " ")}
        </p>
      )}
      {typeof channel === "string" && channel && (
        <p className="mt-1 bee-eyebrow">{t("viaChannel", { channel })}</p>
      )}

      {/* Alternativa al drag-and-drop — el HTML5 drag nativo no funciona en
          touch (celular/tablet), y sin esto no había NINGUNA forma de mover
          una oportunidad de etapa desde esos dispositivos. stopPropagation
          en click/pointerDown para que interactuar con el select no abra el
          drawer (el onClick de la tarjeta) ni intente iniciar un drag. */}
      <div
        className="mt-2.5 border-t border-border/60 pt-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <select
          value={opportunity.status}
          onChange={(e) => onMove(opportunity.id, e.target.value as CrmStage)}
          aria-label={t("moveToStage")}
          className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        >
          {CRM_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {t("moveToOption", { stage: t(`stages.${s.id}`) })}
            </option>
          ))}
        </select>
      </div>
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
  onMove,
}: {
  stage: CrmStage;
  label: string;
  cards: Opportunity[];
  draggingId: string | null;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (stage: CrmStage) => void;
  onMove: (id: string, stage: CrmStage) => void;
}) {
  const t = useTranslations("crm.board");
  const pathname = usePathname();
  const [over, setOver] = useState(false);

  // "Tu prioridad" is the one column BEE never fills on its own — nothing
  // in the backend auto-promotes an opportunity into it (see stageHelp's
  // own explainer). Pointing to Priorización's Bandeja de Decisiones from
  // right here is what makes the distinction land instead of just being
  // read once and forgotten: "if this isn't automatic, where's the
  // automatic version?" answered in the same glance.
  const priorityHref = pathname?.startsWith("/probar") ? "/probar/priority" : "/dashboard/priority";

  return (
    <div className="flex w-[min(100%,280px)] shrink-0 flex-col">
      <div className="mb-1 flex shrink-0 items-baseline justify-between px-1">
        <div className="flex items-center gap-1">
          <h3 className="bee-eyebrow">{label}</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("stageHelpAria")}
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <CircleHelp className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-left" side="bottom">
              {t(`stageHelp.${stage}`)}
            </TooltipContent>
          </Tooltip>
        </div>
        <span className="font-mono bee-micro">{cards.length}</span>
      </div>
      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2 px-1">
        <p className="bee-micro text-muted-foreground">{t(`stageSubtitles.${stage}`)}</p>
        {stage === "prioritized" && (
          <Link href={priorityHref} className="shrink-0 bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
            {t("prioritizedLink")}
          </Link>
        )}
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
          // No fixed/percentage height and no overflow-y-auto here anymore
          // — the column grows with its own cards and the whole page
          // scrolls, same as every other section (Resumen included),
          // instead of being locked to viewport height with its own
          // internal scrollbar. min-h keeps an empty column's "Sin
          // oportunidades aquí" message from collapsing to nothing.
          "flex min-h-[160px] flex-col gap-2.5 rounded-[var(--radius-lg)] border-2 border-dashed border-transparent bg-[var(--color-primary)]/25 p-2.5 transition-colors",
          over && "border-[var(--color-chart-4)] bg-[var(--color-chart-4)]/10",
        )}
      >
        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-8 text-center">
            <Inbox className="size-4 text-muted-foreground" />
            <p className="bee-micro">{t("emptyColumn.title")}</p>
            <p className="bee-micro">{t("emptyColumn.hint")}</p>
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
              onMove={onMove}
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
  const t = useTranslations("crm.board");
  const locale = useLocale() as Locale;
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { openOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

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

  // Compartida por el drop del drag-and-drop y por el <select> "Mover a" de
  // cada CrmCard (la alternativa no-táctil-dependiente) — un solo camino
  // para mover una oportunidad, no dos implementaciones que puedan divergir.
  function moveOpportunity(id: string, stage: CrmStage) {
    const current = opportunities.find((o) => o.id === id);
    if (!current || current.status === stage) return;

    moveStage.mutate(
      { id, stage },
      {
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : t("moveError"));
        },
      },
    );
  }

  function handleDrop(stage: CrmStage) {
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    moveOpportunity(id, stage);
  }

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      <Badge variant={live ? "success" : "warning"}>{live ? t("live") : t("demo")}</Badge>
      <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary text-xs">
        {t("newOpportunity")}
      </button>
    </div>
  );
  const newForm = showNew && <NewOpportunityForm onDone={() => setShowNew(false)} />;

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
      <div>
        {header}
        {newForm}
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <Inbox className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("emptyState.title")}</p>
          <p className="bee-caption mt-1">{t("emptyState.hint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      {newForm}

      {/* items-start (not the default items-stretch): each column sizes to
          its own cards instead of all four being forced to match
          whichever one has the most — that's what let the whole board's
          height grow with real content and the page scroll normally,
          instead of every column being locked to a shared fixed height
          with its own internal scrollbar. */}
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {CRM_STAGES.map((s) => (
          <CrmColumn
            key={s.id}
            stage={s.id}
            label={t(`stages.${s.id}`)}
            cards={stages[s.id]}
            draggingId={draggingId}
            onOpen={openOpportunity}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onMove={moveOpportunity}
          />
        ))}

        {/* Cerradas — solo lectura, ganar/perder es una acción dedicada, no un drop. */}
        <div className="flex h-full w-[min(100%,280px)] shrink-0 flex-col">
          <div className="mb-3 flex shrink-0 items-baseline justify-between px-1">
            <h3 className="bee-eyebrow">{t("stages.closed")}</h3>
            <span className="font-mono bee-micro">{closed.length}</span>
          </div>
          <div className="flex h-full min-h-[220px] flex-1 flex-col gap-2.5 overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-block-muted)] p-2.5">
            {closed.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-8 text-center">
                <p className="bee-micro">{t("emptyClosed")}</p>
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
                    {stripOpportunityTitlePrefix(opp.title)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={opp.status === "won" ? "success" : "secondary"}
                      className="text-[11px]"
                    >
                      {opp.status === "won"
                        ? t("closedStatus.won")
                        : opp.status === "lost"
                          ? t("closedStatus.lost")
                          : t("closedStatus.dismissed")}
                    </Badge>
                    {(opp.opportunity_type ?? "new_logo") !== "new_logo" && (
                      <Badge
                        variant={opportunityTypeVariant(opp.opportunity_type ?? "new_logo")}
                        className="text-[11px]"
                      >
                        {opportunityTypeLabels[opp.opportunity_type ?? "new_logo"]}
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
