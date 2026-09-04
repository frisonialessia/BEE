"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** The drawer's top bar: what's on the left changes with the mode
 *  (position in the column, or the create title); the right ends with
 *  "Cerrar" in view mode. */
export function DrawerTopBar({ left, right, hideClose }: { left: ReactNode; right?: ReactNode; hideClose?: boolean }) {
  const t = useTranslations("crm.drawer");
  const { closeOpportunity } = useDrawerClose();
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">{left}</div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {/* Create mode owns its two actions (Cancelar · Guardar borrador) —
            a third "Cerrar" there would be a second way to do the same. */}
        {!hideClose && (
          <button type="button" onClick={closeOpportunity} className="bee-btn-ghost text-xs">
            <X className="size-3.5" />
            {t("close")}
          </button>
        )}
      </div>
    </div>
  );
}

/** "2 de 7 en Listas para actuar" with up/down arrows that walk the
 *  same column, in the board's own order. */
export function PipelinePosition({
  index,
  count,
  stageLabel,
  onPrev,
  onNext,
}: {
  index: number;
  count: number;
  stageLabel: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const t = useTranslations("crm.drawer");
  return (
    <>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          aria-label={t("prevInColumn")}
          className="bee-btn-ghost bee-btn--icon !h-8 !w-8 disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={onNext ?? undefined}
          disabled={!onNext}
          aria-label={t("nextInColumn")}
          className="bee-btn-ghost bee-btn--icon !h-8 !w-8 disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <p className="truncate text-sm">
        <span className="font-bold tabular-nums">{index}</span>
        <span className="text-muted-foreground"> {t("of")} </span>
        <span className="font-bold tabular-nums">{count}</span>
        <span className="text-muted-foreground"> {t("in")} </span>
        <span className="font-medium">{stageLabel}</span>
      </p>
    </>
  );
}

// Local indirection so the top bar can be rendered from both panes
// without each of them wiring the context themselves.
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
function useDrawerClose() {
  const { closeOpportunity } = useOpportunityDrawer();
  return { closeOpportunity };
}
