"use client";

import { CircleHelp, Inbox, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SALES } from "@/components/charts/palette";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { NewOpportunityForm } from "@/features/crm/new-opportunity-form";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES, groupByCrmStage } from "@/lib/crm-board";
import { formatChannel, formatNextBestAction, stripOpportunityTitlePrefix } from "@/lib/format";
import { formatMoney } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import type { Opportunity } from "@/types/domain";
import { LiveBadge } from "@/components/live-badge";

const COLUMN_MIN = 212;
const CARD_H = 118;
const DAY_MS = 86_400_000;

/**
 * Palette "F1": honey for what BEE detects (new, ready), lilac and indigo
 * for what the team works (priority, conversation). Closed is the one
 * place with the sales greens. All brand tokens.
 */
const STAGE_ACCENT: Record<CrmStage | "closed", string> = {
  detected: "var(--color-chart-3)",
  ready_to_action: "var(--color-chart-1)",
  prioritized: "var(--color-chart-6)",
  in_progress: "var(--color-chart-4)",
  closed: SALES.won,
};

/** Heat by score — the only place the score shows without opening anything. */
function intensity(score: number): number {
  return score >= 75 ? 100 : score >= 50 ? 70 : 45;
}

/** Won deals: the three greens by how recent the close is. */
function wonColor(closedAt: string | null, now: number): string {
  const days = closedAt ? (now - new Date(closedAt).getTime()) / DAY_MS : 999;
  return days <= 31 ? SALES.won : days <= 92 ? SALES.lime : SALES.mint;
}

/** Progress segments: signal detected · strategy ready · conversation open. */
function progressOf(status: Opportunity["status"]): number {
  if (status === "detected") return 1;
  if (status === "ready_to_action" || status === "prioritized") return 2;
  return 3;
}

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
}

function CrmCard({
  opportunity,
  meta,
  accent,
  now,
  dragging,
  draggable,
  menuOpen,
  style,
  onOpen,
  onToggleMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
}: {
  opportunity: Opportunity;
  meta: CardMeta;
  accent: string;
  now: number;
  dragging: boolean;
  draggable: boolean;
  menuOpen: boolean;
  style: React.CSSProperties;
  onOpen: (id: string) => void;
  onToggleMenu: (id: string | null) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
  onMove?: (id: string, stage: CrmStage) => void;
}) {
  const t = useTranslations("crm.board");
  const locale = useLocale() as Locale;
  const strategy = opportunity.strategy;
  const isHot = Boolean((strategy as Record<string, unknown> | undefined)?.hot_lead);
  const won = opportunity.status === "won";
  const closed = won || opportunity.status === "lost" || opportunity.status === "dismissed";
  const dateFmt = new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short" });
  const when = dateFmt.format(new Date(closed && opportunity.closed_at ? opportunity.closed_at : opportunity.created_at));
  const company = meta.company ?? stripOpportunityTitlePrefix(opportunity.title);
  const title = won
    ? t("clientSince", { company, date: when })
    : opportunity.status === "lost"
      ? t("lostTitle", { company })
      : opportunity.status === "dismissed"
        ? t("dismissedTitle", { company })
        : stripOpportunityTitlePrefix(opportunity.title);
  const background = closed
    ? won
      ? wonColor(opportunity.closed_at, now)
      : "color-mix(in srgb, var(--color-text) 8%, var(--color-card))"
    : `color-mix(in srgb, ${accent} ${intensity(opportunity.score)}%, var(--color-card))`;
  const progress = progressOf(opportunity.status);
  const tooltip = [
    t("tooltip.score", { score: Math.round(opportunity.score) }),
    opportunity.amount ? formatMoney(opportunity.amount, "USD", locale, true) : null,
    typeof strategy?.next_best_action === "string" && !closed ? formatNextBestAction(strategy.next_best_action, locale) : null,
    typeof strategy?.channel === "string" && !closed ? formatChannel(strategy.channel, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
      style={{ ...style, background, height: CARD_H }}
      className={cn(
        "bee-kanban-card group relative z-10 grid min-w-0 cursor-pointer grid-rows-[34px_6px_28px] gap-y-2.5 rounded-[14px] px-3.5 pb-3 pt-3.5 text-left text-[var(--color-text)]",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "z-20 -translate-y-0.5 rotate-[0.5deg] opacity-90 shadow-2xl ring-2 ring-[var(--color-chart-4)]",
        closed && !won && "opacity-70",
        menuOpen && "z-30",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="line-clamp-2 pr-6 text-xs font-semibold leading-[1.35]">{title}</p>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>

      {/* ··· menu: open, and move to another stage (the touch/keyboard path). */}
      <button
        type="button"
        aria-label={t("menu.aria")}
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(menuOpen ? null : opportunity.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 22, height: 22, bottom: "auto", left: "auto" }}
        className="absolute right-3 top-3 grid place-items-center rounded-full bg-white/70 text-xs leading-none tracking-[1px] text-[var(--color-text)] hover:bg-white"
      >
        ···
      </button>
      {menuOpen && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stops propagation so menu clicks don't open the drawer
        <div
          style={{ bottom: "auto", left: "auto", height: "auto" }}
          className="absolute right-3 top-9 z-40 min-w-44 rounded-[12px] bg-[var(--color-card)] p-1 text-xs shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { onToggleMenu(null); onOpen(opportunity.id); }} className="block w-full rounded-[8px] px-3 py-1.5 text-left font-medium hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]">
            {t("menu.open")}
          </button>
          {onMove && (
            <>
              <p className="bee-micro px-3 pb-1 pt-2">{t("moveToStage")}</p>
              {CRM_STAGES.filter((s) => s.id !== opportunity.status).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onToggleMenu(null); onMove(opportunity.id, s.id); }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-1.5 text-left hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
                >
                  <span className="size-2 rounded-full" style={{ background: STAGE_ACCENT[s.id] }} />
                  {t(`stages.${s.id}`)}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Progress: three segments */}
      <div className="flex gap-1" aria-label={t("progress.aria", { step: progress })}>
        {[1, 2, 3].map((i) => (
          <i key={i} className="h-1 flex-1 rounded-full" style={{ background: progress >= i ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
        ))}
      </div>

      {/* Owner · date · hot star */}
      <div className="flex items-center gap-2">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-full border-2 border-white/70 bg-white text-[9px] font-bold">
          {meta.owner ? initials(meta.owner) : "—"}
        </span>
        <span className="flex min-w-0 flex-col leading-[1.2]">
          <span className="truncate text-[11.5px] font-medium">{meta.owner ?? t("unassigned")}</span>
          <span className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">{when}</span>
        </span>
        {isHot && !closed && <Star aria-label={t("hot")} className="ml-auto size-3.5 shrink-0 fill-[var(--color-text)] text-[var(--color-text)]" />}
      </div>
    </div>
  );
}

function ColumnHeader({ stage, count, accent, style }: { stage: CrmStage | "closed"; count: number; accent: string; style: React.CSSProperties }) {
  const t = useTranslations("crm.board");
  const pathname = usePathname();
  const priorityHref = pathname?.startsWith("/probar") ? "/probar/priority" : "/dashboard/priority";
  return (
    <div style={{ ...style, borderTopColor: accent }} className="flex min-w-0 items-center gap-2 border-t-[3px] px-0.5 pb-3 pt-2.5">
      <h3 className="truncate text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{t(`stages.${stage}`)}</h3>
      {stage !== "closed" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={t("stageHelpAria")} className="text-muted-foreground transition-colors hover:text-foreground">
              <CircleHelp className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px] text-left" side="bottom">
            {t(`stageHelp.${stage}`)}
            {stage === "prioritized" && (
              <Link href={priorityHref} className="mt-1 block font-medium underline">
                {t("prioritizedLink")}
              </Link>
            )}
          </TooltipContent>
        </Tooltip>
      )}
      <span className="ml-auto text-sm font-light tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

/**
 * CRM — the pipeline as one CSS grid (row 1 headers, rows 2..n cards), so
 * every card on a row shares one height and the board reads as a solid
 * grid. Cards carry no numbers: the column is the stage, the color's
 * intensity is the score, the three segments are the progress, and the
 * star is BEE's hot-lead flag. Score, amount, action and channel live in
 * the tooltip and the drawer. Won/lost stays a dedicated action in the
 * drawer, never a drop; Cerradas is the one column with the greens.
 */
export function CrmBoard() {
  const t = useTranslations("crm.board");
  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { data: companiesResult } = useCompanies(300);
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [now] = useState(() => Date.now());

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const live = oppsResult?.live ?? false;
  const { stages, closed } = useMemo(() => groupByCrmStage(opportunities), [opportunities]);
  const metaById = useMemo(() => {
    const companies = new Map((companiesResult?.data ?? []).map((c) => [c.id, c.name]));
    const people = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    return new Map(
      opportunities.map((o) => [
        o.id,
        { company: o.company_id ? companies.get(o.company_id) ?? null : null, owner: o.assigned_to_user_id ? people.get(o.assigned_to_user_id) ?? null : null } satisfies CardMeta,
      ]),
    );
  }, [opportunities, companiesResult, users]);

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
    setMenuId(null);
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
      <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(5, minmax(${COLUMN_MIN}px, 1fr))` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-[14px]" />
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
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- closes an open card menu on any click outside it
    <div onClick={() => menuId && setMenuId(null)}>
      {header}
      {newForm}

      <div className="overflow-x-auto pb-2">
        <div className="grid gap-x-3.5 gap-y-3" style={{ gridTemplateColumns: `repeat(5, minmax(${COLUMN_MIN}px, 1fr))`, gridTemplateRows: `auto repeat(${rowCount}, ${CARD_H}px)` }}>
          {columns.map((col, c) => (
            <ColumnHeader key={`h-${col.key}`} stage={col.key} count={col.cards.length} accent={STAGE_ACCENT[col.key]} style={{ gridColumn: c + 1, gridRow: 1 }} />
          ))}

          {/* Drop zones: one invisible cell per open column spanning every card row. */}
          {columns.map((col, c) => {
            const droppable = col.key !== "closed";
            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drop zone; keyboard path is each card's menu.
              <div
                key={`bg-${col.key}`}
                onDragOver={droppable ? (e) => { e.preventDefault(); if (overStage !== col.key) setOverStage(col.key as CrmStage); } : undefined}
                onDragLeave={droppable ? () => setOverStage((s) => (s === col.key ? null : s)) : undefined}
                onDrop={droppable ? (e) => { e.preventDefault(); handleDrop(col.key as CrmStage); } : undefined}
                className={cn("-m-1.5 rounded-[16px] transition-colors", overStage === col.key && "bg-[var(--color-chart-4)]/10 ring-2 ring-[var(--color-chart-4)]/40")}
                style={{ gridColumn: c + 1, gridRow: `2 / span ${rowCount}` }}
              />
            );
          })}

          {columns.map((col, c) =>
            col.cards.length === 0 ? (
              <div
                key={`empty-${col.key}`}
                style={{
                  gridColumn: c + 1,
                  gridRow: 2,
                  height: CARD_H,
                  background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-text) 5%, transparent) 0 6px, transparent 6px 14px)",
                }}
                className="relative z-10 grid place-items-center rounded-[14px] text-center"
              >
                <p className="bee-micro">{col.key === "closed" ? t("emptyClosed") : t("emptyColumn.title")}</p>
              </div>
            ) : (
              col.cards.map((opp, r) => (
                <CrmCard
                  key={opp.id}
                  opportunity={opp}
                  meta={metaById.get(opp.id) ?? { company: null, owner: null }}
                  accent={STAGE_ACCENT[col.key]}
                  now={now}
                  dragging={draggingId === opp.id}
                  draggable={col.key !== "closed"}
                  menuOpen={menuId === opp.id}
                  style={{ gridColumn: c + 1, gridRow: r + 2 }}
                  onOpen={openOpportunity}
                  onToggleMenu={setMenuId}
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
