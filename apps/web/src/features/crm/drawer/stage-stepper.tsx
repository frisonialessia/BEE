"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { mix } from "@/components/charts/palette";
import type { CrmStage } from "@/lib/api/opportunities";
import { cn } from "@/lib/utils";
import type { OpportunityStatus } from "@/types/domain";

import { STAGE_ACCENT, STEP_ORDER, isClosedStatus, stepOf, type StepKey } from "./stage-meta";

const CHEVRON_FIRST = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";
const CHEVRON = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";
const CHEVRON_LAST = "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)";

/**
 * Pipeline as chevron segments: Nuevas → Listas → Tu prioridad → En
 * conversación → Cerradas. Current segment filled in the stage's own BEE
 * color, earlier ones tinted, later ones neutral. Clicking an open stage
 * moves the deal (same mutation as dragging on the board); Cerradas is
 * never a click target — closing is a dedicated action (Notas tab).
 */
export function StageStepper({
  status,
  closedLabel,
  onMove,
  busy,
  allowed,
}: {
  status: OpportunityStatus;
  /** "Cliente" / "Perdida" / "Descartada" for a closed deal. */
  closedLabel: string | null;
  onMove: (stage: CrmStage) => void;
  busy?: boolean;
  /** Create mode: only the stages a person may *start* a deal in are
   *  click targets (BEE's own gate, "Listas para actuar", never is). */
  allowed?: readonly CrmStage[];
}) {
  const t = useTranslations("crm.drawer");
  const tStage = useTranslations("crm.board.stages");
  const refs = useRef<HTMLButtonElement[]>([]);
  const current = stepOf(status);
  const currentIdx = STEP_ORDER.indexOf(current);
  const closed = isClosedStatus(status);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    let next = i;
    for (let k = 0; k < STEP_ORDER.length; k++) {
      next = (next + dir + STEP_ORDER.length) % STEP_ORDER.length;
      if (refs.current[next] && !refs.current[next].disabled) break;
    }
    refs.current[next]?.focus();
  }

  function fill(step: StepKey, i: number): string {
    const accent = STAGE_ACCENT[step];
    if (step === "closed") {
      // Green only for a won client; a lost/dismissed deal closes in ink.
      if (!closed) return mix("var(--color-text)", 6);
      return status === "won" ? accent : mix("var(--color-text)", 18);
    }
    if (i === currentIdx) return accent;
    if (i < currentIdx) return mix(accent, 45);
    return mix("var(--color-text)", 6);
  }

  return (
    <div role="group" aria-label={t("stepper.aria")} className="flex w-full">
      {STEP_ORDER.map((step, i) => {
        const isCurrent = i === currentIdx;
        const label = step === "closed" && closedLabel ? closedLabel : tStage(step);
        const clickable = step !== "closed" && !closed && !isCurrent && (!allowed || allowed.includes(step as CrmStage));
        return (
          <button
            key={step}
            ref={(el) => {
              if (el) refs.current[i] = el;
            }}
            type="button"
            disabled={!clickable || busy}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={clickable ? t("stepper.moveTo", { stage: label }) : label}
            onClick={clickable ? () => onMove(step as CrmStage) : undefined}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative -ml-[6px] h-9 min-w-0 flex-1 truncate px-4 text-sm transition-[filter] first:ml-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-chart-4)]",
              isCurrent ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text)]",
              clickable ? "hover:brightness-95" : "cursor-default",
              !isCurrent && i > currentIdx && step !== "closed" && "text-muted-foreground",
            )}
            style={{
              background: fill(step, i),
              clipPath: i === 0 ? CHEVRON_FIRST : i === STEP_ORDER.length - 1 ? CHEVRON_LAST : CHEVRON,
              paddingLeft: i === 0 ? 14 : 20,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
