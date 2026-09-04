"use client";

import { useTranslations } from "next-intl";

import { ACTION_BY_VALUE, CHANNEL_ICON, stepDayOffsets } from "@/components/sequences/action-palette";
import type { StepDefinition } from "@/lib/api/sequences";

function describeCondition(t: ReturnType<typeof useTranslations>, condition: string): string {
  if (t.has(`conditions.${condition}`)) return t(`conditions.${condition}`);
  const timeout = /^not_(.+)_(\d+)d$/.exec(condition);
  if (timeout) {
    const [, event, days] = timeout;
    return t("timeout", { event, days: Number(days) });
  }
  return condition;
}

/** The steps of a flow as hairline rows — what each one does and the real
 *  condition the engine evaluates to advance (`DynamicSequenceEngine.advance`,
 *  via `POST .../executions/{id}/advance`). Read-only; the timeline above it
 *  shows the same steps as a cadence, this is the detail. Assumes a mostly
 *  linear chain — the order of `steps` is the visual order — which is
 *  exactly what the builder produces. */
export function FlowCanvas({ steps, onRemoveStep }: { steps: StepDefinition[]; onRemoveStep?: (stepId: string) => void }) {
  const t = useTranslations("workspace.sequences.flowCanvas");
  const tActions = useTranslations("workspace.sequences.actions");
  const tTimeline = useTranslations("workspace.sequences.timeline");
  const offsets = stepDayOffsets(steps);

  if (steps.length === 0) {
    return (
      <p className="bee-caption py-4">
        {t("empty.title")} {t("empty.subtitle")}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const def = ACTION_BY_VALUE[step.action];
        const Icon = def?.icon;
        const channel = step.channel ?? def?.channel ?? "email";
        const ChannelIcon = CHANNEL_ICON[channel];
        const primaryTransition = step.transitions[0];
        const isLast = i === steps.length - 1;
        return (
          <li key={step.id} className="bee-row items-start">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-primary)]">
              {Icon ? <Icon className="size-3.5 stroke-[1.5]" /> : ChannelIcon ? <ChannelIcon className="size-3.5 stroke-[1.5]" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{step.name}</p>
              <p className="bee-caption truncate">{def ? tActions(`${step.action}.description`) : step.action}</p>
              {step.notes && <p className="bee-micro mt-0.5">{step.notes}</p>}
              <p className="bee-micro mt-0.5">{isLast || !primaryTransition ? t("end") : `→ ${t("advance", { condition: describeCondition(t, primaryTransition.condition) })}`}</p>
            </div>
            <span className="bee-micro shrink-0">{tTimeline("day", { day: offsets[i] })}</span>
            {onRemoveStep && (
              <button type="button" onClick={() => onRemoveStep(step.id)} className="bee-btn-text h-auto shrink-0 px-1" aria-label={t("removeStepAria")}>
                ×
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
