"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { mix } from "@/components/charts/palette";
import type { CrmStage } from "@/lib/api/opportunities";
import { cn } from "@/lib/utils";
import type { OpportunityStatus } from "@/types/domain";

import { LOST_FILL, STAGE_ACCENT, STEP_ORDER, isClosedStatus, stepOf, type StepKey } from "./stage-meta";

const CHEVRON_FIRST = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";
const CHEVRON = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";
const CHEVRON_LAST = "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)";

/** Stages not reached yet: the faintest lavender, so the row reads as one
 *  track and the current segment (a full stage hue) is the only saturated
 *  fill. Paler than "En conversación"'s own lavender on purpose. */
const FUTURE_FILL = mix("var(--color-primary)", 45);

/**
 * Pipeline as chevron segments: Nuevas → Listas → Tu prioridad → En
 * conversación → Cerradas. Current segment filled in the stage's own BEE
 * hue, earlier ones at 45 % of theirs, later ones in faint lavender.
 * Clicking an open stage moves the deal (same mutation as dragging on the
 * board); Cerradas is never a click target — closing is a dedicated action
 * (Notas tab). The fills crossfade when the deal moves (.bee-drawer-step).
 */
export function StageStepper({
  status,
  closedLabel,
  onMove,
  busy,
}: {
  status: OpportunityStatus;
  /** "Cliente" / "Perdida" / "Descartada" for a closed deal. */
  closedLabel: string | null;
  onMove: (stage: CrmStage) => void;
  busy?: boolean;
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
      // Honey for a won client; a lost/dismissed deal closes in ink.
      if (!closed) return FUTURE_FILL;
      return status === "won" ? accent : LOST_FILL;
    }
    if (i === currentIdx) return accent;
    if (i < currentIdx) return mix(accent, 45);
    return FUTURE_FILL;
  }

  return (
    <div role="group" aria-label={t("stepper.aria")} className="flex w-full">
      {STEP_ORDER.map((step, i) => {
        const isCurrent = i === currentIdx;
        const label = step === "closed" && closedLabel ? closedLabel : tStage(step);
        const clickable = step !== "closed" && !closed && !isCurrent;
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
              "bee-drawer-step relative -ml-[6px] h-9 min-w-0 flex-1 truncate px-4 text-sm text-[var(--color-text)] first:ml-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-text)]",
              isCurrent && "font-semibold",
              clickable ? "hover:brightness-95" : "cursor-default",
              !isCurrent && i > currentIdx && "text-muted-foreground",
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
