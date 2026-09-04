"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { OpportunityStatus } from "@/types/domain";

import { initials } from "./primitives";

const CARD_H = 118;

/** Heat by score — same steps as the board (features/crm/crm-board.tsx). */
function intensity(score: number): number {
  return score >= 75 ? 100 : score >= 50 ? 70 : 45;
}

/** Progress segments: signal detected · strategy ready · conversation open. */
function progressOf(status: OpportunityStatus): number {
  if (status === "detected") return 1;
  if (status === "ready_to_action" || status === "prioritized") return 2;
  return 3;
}

/**
 * The CRM board's card, drawn from a draft: same size, same rounded fill
 * (the stage hue at the score's intensity), same three progress segments,
 * same owner disc — so what you type on the left is what the board will
 * show. Sits under a mini column header so the stage reads as a column.
 * The fill crossfades when the stage changes (see .bee-drawer-card).
 */
export function PreviewCard({
  title,
  placeholder,
  stageLabel,
  columnCount,
  accent,
  score,
  status,
  ownerName,
  date,
  hot,
}: {
  title: string;
  /** Shown muted when there is no title yet. */
  placeholder: string;
  stageLabel: string;
  /** Cards already in that column, this one included. */
  columnCount: number;
  accent: string;
  score: number;
  status: OpportunityStatus;
  ownerName: string | null;
  date: string;
  hot: boolean;
}) {
  const t = useTranslations("crm.board");
  const progress = progressOf(status);
  return (
    <div className="w-full max-w-[280px]">
      <div className="flex items-center gap-2 border-t-[3px] px-0.5 pb-3 pt-2.5 transition-[border-color] duration-300" style={{ borderTopColor: accent }}>
        <h4 className="bee-eyebrow truncate">{stageLabel}</h4>
        <span className="ml-auto text-sm font-light tabular-nums text-muted-foreground">{columnCount}</span>
      </div>
      <div
        className="bee-kanban-card bee-drawer-card grid grid-rows-[34px_6px_28px] gap-y-2.5 rounded-[14px] px-3.5 pb-3 pt-3.5 text-left text-[var(--color-text)]"
        style={{ height: CARD_H, background: `color-mix(in srgb, ${accent} ${intensity(score)}%, var(--color-card))` }}
      >
        <p className={cn("line-clamp-2 pr-6 text-xs font-semibold leading-[1.35]", !title && "font-medium text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]")}>
          {title || placeholder}
        </p>
        <div className="flex gap-1" aria-label={t("progress.aria", { step: progress })}>
          {[1, 2, 3].map((i) => (
            <i key={i} className="h-1 flex-1 rounded-full transition-colors duration-300" style={{ background: progress >= i ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full border-2 border-white/70 bg-white text-[9px] font-bold">
            {ownerName ? initials(ownerName) : "—"}
          </span>
          <span className="flex min-w-0 flex-col leading-[1.2]">
            <span className="truncate text-[11.5px] font-medium">{ownerName ?? t("unassigned")}</span>
            <span className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">{date}</span>
          </span>
          {hot && <Star aria-label={t("hot")} className="ml-auto size-3.5 shrink-0 fill-[var(--color-text)] text-[var(--color-text)]" />}
        </div>
      </div>
    </div>
  );
}
