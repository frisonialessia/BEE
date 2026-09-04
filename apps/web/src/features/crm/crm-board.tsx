"use client";

import {
  Activity,
  AlertCircle,
  Banknote,
  Building2,
  CircleHelp,
  Cpu,
  FileText,
  Globe,
  Handshake,
  Inbox,
  Newspaper,
  Radio,
  Rocket,
  Scale,
  Star,
  Store,
  UserCog,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SALES, mix } from "@/components/charts/palette";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { NewOpportunityForm } from "@/features/crm/new-opportunity-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES, groupByCrmStage } from "@/lib/crm-board";
import { formatChannel, formatNextBestAction, getOpportunityTypeLabels, getSignalTypeLabels, stripOpportunityTitlePrefix } from "@/lib/format";
import { formatMoney } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import type { Opportunity, SignalType } from "@/types/domain";
import { LiveBadge } from "@/components/live-badge";

/**
 * The BEE brain on a card, without words: one small icon per signal type.
 * The label lives in the tooltip; the rep learns the glyphs in a day.
 */
const SIGNAL_ICON: Record<SignalType, LucideIcon> = {
  funding_round: Banknote,
  funding_grant: Banknote,
  hiring: UserPlus,
  leadership_change: UserCog,
  tech_adoption: Cpu,
  product_launch: Rocket,
  expansion: Globe,
  franchise_expansion: Store,
  merger_acquisition: Handshake,
  news_mention: Newspaper,
  engagement: Activity,
  public_tender: FileText,
  regulatory_change: Scale,
  other: Radio,
};

const COLUMN_MIN = 212;

/** Stage accent for the card's left border and score pill (brand tokens). */
const STAGE_ACCENT: Record<CrmStage | "closed", string> = {
  detected: "var(--color-chart-3)",
  ready_to_action: "var(--color-chart-6)",
  prioritized: "var(--color-chart-1)",
  in_progress: "var(--color-chart-4)",
  closed: SALES.won,
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

interface CardMeta {
  company: string | null;
  owner: string | null;
  signalType: SignalType | null;
  signalTitle: string | null;
}

/**
 * One block of the grid: white, a 4px stage-colored left border, the title
 * in text-sm, metadata in text-xs, the BEE score as a small pill and the
 * signal as an icon. `flex h-full flex-col` so a row of cards is one clean
 * horizontal line whatever each title's length.
 */
function CrmCard({
  opportunity,
  meta,
  accent,
  dragging,
  draggable = true,
  style,
  onOpen,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
}: {
  opportunity: Opportunity;
  meta: CardMeta;
  accent: string;
  dragging: boolean;
  draggable?: boolean;
  style: React.CSSProperties;
  onOpen: (id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
  onMove?: (id: string, stage: CrmStage) => void;
}) {
  const t = useTranslations("crm.board");
  const locale = useLocale() as Locale;
  const strategy = opportunity.strategy;
  const nextAction = strategy?.next_best_action;
  const isHot = Boolean((strategy as Record<string, unknown> | undefined)?.hot_lead);
  const reviewRequired = Boolean(strategy?.manual_review_required);
  const opportunityType = opportunity.opportunity_type ?? "new_logo";
  const typeLabels = getOpportunityTypeLabels(locale);
  const signalType: SignalType = meta.signalType ?? "other";
  const SignalIcon = SIGNAL_ICON[signalType] ?? Radio;
  const signalLabel = getSignalTypeLabels(locale)[signalType] ?? signalType;
  const won = opportunity.status === "won";
  const closed = opportunity.status === "won" || opportunity.status === "lost" || opportunity.status === "dismissed";

  return (
    <div
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => onDragStart(e, opportunity.id) : undefined}
      onDragEnd={onDragEnd}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              onDrop();
            }
          : undefined
      }
      onClick={() => onOpen(opportunity.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(opportunity.id);
      }}
      style={{ ...style, borderLeftColor: closed && !won ? "var(--color-divider)" : accent }}
      className={cn(
        "bee-kanban-card group relative z-10 flex h-full min-w-0 cursor-pointer flex-col gap-2 border-l-4 p-3 text-left",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "z-20 -translate-y-0.5 rotate-[0.5deg] opacity-90 shadow-2xl ring-2 ring-[var(--color-chart-4)]",
        closed && !won && "opacity-70",
      )}
    >
      {/* Title + BEE score */}
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">{stripOpportunityTitlePrefix(opportunity.title)}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums"
              style={{ background: mix(won ? SALES.mint : accent, won ? 100 : 22), color: "var(--color-text)" }}
            >
              {Math.round(opportunity.score)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{t("scoreTooltip", { score: Math.round(opportunity.score) })}</TooltipContent>
        </Tooltip>
      </div>

      {/* Metadata: account · owner · amount */}
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {meta.company && (
          <span className="flex min-w-0 items-center gap-1">
            <Building2 className="size-3 shrink-0" />
            <span className="truncate">{meta.company}</span>
          </span>
        )}
        {meta.owner && (
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-semibold text-[var(--color-text)]"
            title={meta.owner}
            aria-label={meta.owner}
          >
            {initials(meta.owner)}
          </span>
        )}
        {opportunity.amount !== null && opportunity.amount > 0 && (
          <span
            className={cn("ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums text-[var(--color-text)]", won && "bg-[#b4e8c5]")}
            style={won ? undefined : { background: "color-mix(in srgb, var(--color-text) 6%, var(--color-card))" }}
          >
            {formatMoney(opportunity.amount, "USD", locale, true)}
          </span>
        )}
      </div>

      {/* Signal glyph row: the brain, minimal */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <SignalIcon className="size-3.5" style={{ color: accent }} />
              <span className="truncate">{signalLabel}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{meta.signalTitle ?? signalLabel}</TooltipContent>
        </Tooltip>
        {opportunityType !== "new_logo" && <span className="truncate">· {typeLabels[opportunityType]}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {isHot && <Star aria-label={t("hot")} className="size-3.5 fill-[var(--color-chart-1)] text-[var(--color-chart-1)]" />}
          {reviewRequired && <AlertCircle className="size-3.5 text-[var(--color-chart-2)]" aria-label={t("reviewRequired")} />}
          {closed && (
            <span
              className="rounded-full px-1.5 py-0.5 text-micro font-semibold"
              style={won ? { background: SALES.won, color: "#fff" } : { background: "color-mix(in srgb, var(--color-text) 8%, var(--color-card))" }}
            >
              {won ? t("closedStatus.won") : opportunity.status === "lost" ? t("closedStatus.lost") : t("closedStatus.dismissed")}
            </span>
          )}
        </span>
      </div>

      {typeof nextAction === "string" && nextAction && !closed && (
        <p className="line-clamp-1 bee-micro font-medium text-[var(--color-text)]">
          {formatNextBestAction(nextAction, locale)}
          {typeof strategy?.channel === "string" && strategy.channel ? ` · ${formatChannel(strategy.channel, locale)}` : ""}
        </p>
      )}

      {/* Touch/keyboard way to move — native drag has no touch equivalent. */}
      {onMove && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops propagation so the select doesn't open the drawer.
        <div className="mt-auto pt-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <select
            value={opportunity.status}
            onChange={(e) => onMove(opportunity.id, e.target.value as CrmStage)}
            aria-label={t("moveToStage")}
            className="w-full rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-text)_5%,var(--color-card))] px-2 py-1 text-micro text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          >
            {CRM_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {t("moveToOption", { stage: t(`stages.${s.id}`) })}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function ColumnHeader({ stage, count, accent, style }: { stage: CrmStage | "closed"; count: number; accent: string; style: React.CSSProperties }) {
  const t = useTranslations("crm.board");
  const pathname = usePathname();
  const priorityHref = pathname?.startsWith("/probar") ? "/probar/priority" : "/dashboard/priority";
  return (
    <div style={style} className="flex min-w-0 flex-col gap-0.5 px-1 pb-2">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
        <h3 className="truncate text-xs font-semibold uppercase tracking-wide">{t(`stages.${stage}`)}</h3>
        {stage !== "closed" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={t("stageHelpAria")} className="text-muted-foreground transition-colors hover:text-foreground">
                <CircleHelp className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-left" side="bottom">
              {t(`stageHelp.${stage}`)}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="ml-auto text-sm font-light tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate bee-micro">{t(`stageSubtitles.${stage}`)}</p>
        {stage === "prioritized" && (
          <Link href={priorityHref} className="shrink-0 bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
            {t("prioritizedLink")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * CRM — the real pipeline as one CSS grid: five columns (four open stages
 * + Cerradas), every card a grid cell, so all cards on the same row share
 * one height and the board reads as a solid grid, never a set of ragged
 * lists. Drag a card between open stages; won/lost stays a dedicated
 * action in the drawer (MEDDIC, loss reason, competitor), never a drop.
 * Cerradas is the one place on the board with the green family: a won
 * deal is a client.
 */
export function CrmBoard() {
  const t = useTranslations("crm.board");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { data: companiesResult } = useCompanies(300);
  const { data: users } = useUsers();
  const { data: signalsResult } = useSignals(300);
  const { openOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);
  const [showNew, setShowNew] = useState(false);

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const live = oppsResult?.live ?? false;
  const { stages, closed } = useMemo(() => groupByCrmStage(opportunities), [opportunities]);
  const metaById = useMemo(() => {
    const companies = new Map((companiesResult?.data ?? []).map((c) => [c.id, c.name]));
    const people = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const signals = new Map((signalsResult?.data ?? []).map((sg) => [sg.id, sg]));
    return new Map(
      opportunities.map((o) => {
        const sg = o.signal_id ? signals.get(o.signal_id) : undefined;
        return [
          o.id,
          {
            company: o.company_id ? companies.get(o.company_id) ?? null : null,
            owner: o.assigned_to_user_id ? people.get(o.assigned_to_user_id) ?? null : null,
            signalType: sg?.signal_type ?? null,
            signalTitle: sg?.title ?? null,
          } satisfies CardMeta,
        ];
      }),
    );
  }, [opportunities, companiesResult, users, signalsResult]);

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }
  function moveOpportunity(id: string, stage: CrmStage) {
    const current = opportunities.find((o) => o.id === id);
    if (!current || current.status === stage) return;
    moveStage.mutate({ id, stage }, { onError: (err) => toast.error(err instanceof ApiError ? err.message : t("moveError")) });
  }
  function handleDrop(stage: CrmStage) {
    const id = draggingId;
    setDraggingId(null);
    setOverStage(null);
    if (!id) return;
    moveOpportunity(id, stage);
  }

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      <LiveBadge live={live} />
      <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary text-xs">
        {t("newOpportunity")}
      </button>
    </div>
  );
  const newForm = <NewOpportunityForm open={showNew} onClose={() => setShowNew(false)} />;

  if (isLoading) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(5, minmax(${COLUMN_MIN}px, 1fr))` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div>
        {header}
        {newForm}
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <Inbox className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("emptyState.title")}</p>
          <p className="bee-caption mt-1">{t("emptyState.hint")}</p>
        </div>
      </div>
    );
  }

  const columns: { key: CrmStage | "closed"; cards: Opportunity[] }[] = [
    ...CRM_STAGES.map((s) => ({ key: s.id, cards: stages[s.id] })),
    { key: "closed", cards: closed },
  ];
  const rowCount = Math.max(1, ...columns.map((c) => c.cards.length));

  return (
    <div>
      {header}
      {newForm}

      {/* One grid for the whole board: row 1 = headers, rows 2..n = cards.
          Cards placed by (column, row) so a row's cells share one height —
          the "no holes" rule. Each column has a background cell spanning
          every card row that doubles as the drop zone. */}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-x-2.5 gap-y-2.5"
          style={{ gridTemplateColumns: `repeat(5, minmax(${COLUMN_MIN}px, 1fr))`, gridTemplateRows: `auto repeat(${rowCount}, auto)` }}
        >
          {columns.map((col, c) => (
            <ColumnHeader key={`h-${col.key}`} stage={col.key} count={col.cards.length} accent={STAGE_ACCENT[col.key]} style={{ gridColumn: c + 1, gridRow: 1 }} />
          ))}

          {columns.map((col, c) => {
            const droppable = col.key !== "closed";
            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- column drop zone; keyboard path is each card's <select>.
              <div
                key={`bg-${col.key}`}
                onDragOver={droppable ? (e) => { e.preventDefault(); if (overStage !== col.key) setOverStage(col.key as CrmStage); } : undefined}
                onDragLeave={droppable ? () => setOverStage((s) => (s === col.key ? null : s)) : undefined}
                onDrop={droppable ? (e) => { e.preventDefault(); handleDrop(col.key as CrmStage); } : undefined}
                className={cn(
                  "-m-1 rounded-[var(--radius-lg)] transition-colors",
                  overStage === col.key ? "bg-[var(--color-chart-4)]/10 ring-2 ring-[var(--color-chart-4)]/40" : "bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]",
                )}
                style={{ gridColumn: c + 1, gridRow: `2 / span ${rowCount}` }}
              />
            );
          })}

          {columns.map((col, c) =>
            col.cards.length === 0 ? (
              <div
                key={`empty-${col.key}`}
                style={{ gridColumn: c + 1, gridRow: 2 }}
                className="relative z-10 flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] px-3 py-3 text-center"
              >
                <Inbox className="size-3.5 text-muted-foreground" />
                <p className="bee-micro">{col.key === "closed" ? t("emptyClosed") : t("emptyColumn.title")}</p>
              </div>
            ) : (
              col.cards.map((opp, r) => (
                <CrmCard
                  key={opp.id}
                  opportunity={opp}
                  meta={metaById.get(opp.id) ?? { company: null, owner: null, signalType: null, signalTitle: null }}
                  accent={STAGE_ACCENT[col.key]}
                  dragging={draggingId === opp.id}
                  draggable={col.key !== "closed"}
                  style={{ gridColumn: c + 1, gridRow: r + 2 }}
                  onOpen={openOpportunity}
                  onDragStart={col.key !== "closed" ? handleDragStart : undefined}
                  onDragEnd={handleDragEnd}
                  onDrop={col.key !== "closed" ? () => handleDrop(col.key as CrmStage) : undefined}
                  onMove={col.key !== "closed" ? moveOpportunity : undefined}
                />
              ))
            ),
          )}
        </div>
      </div>
    </div>
  );
}
