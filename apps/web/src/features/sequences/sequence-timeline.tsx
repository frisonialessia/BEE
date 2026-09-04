"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { ACTION_BY_VALUE, CHANNEL_ICON, stepDayOffsets } from "@/components/sequences/action-palette";
import type { StepDefinition } from "@/lib/api/sequences";
import { cn } from "@/lib/utils";

const LINE = "color-mix(in srgb, var(--color-text) 12%, transparent)";

/**
 * A sequence as a horizontal timeline: one dot per step on a thin ink line,
 * the step's name under it, its channel as a small lavender chip, the day
 * it fires in micro type. One hue (the page's lilac) for every dot; the
 * current step, when known, is the filled one. Scrolls sideways on a phone
 * rather than wrapping — a cadence reads left to right.
 */
export function SequenceTimeline({
  steps,
  tone = TONE.prepared,
  currentStepId,
  onRemoveStep,
  className,
}: {
  steps: StepDefinition[];
  tone?: string;
  /** Marks where an enrollment stands; steps before it read as done. */
  currentStepId?: string | null;
  onRemoveStep?: (stepId: string) => void;
  className?: string;
}) {
  const t = useTranslations("workspace.sequences.timeline");
  const offsets = stepDayOffsets(steps);
  const currentIndex = currentStepId ? steps.findIndex((s) => s.id === currentStepId) : -1;

  if (steps.length === 0) return <p className="bee-caption py-4">{t("empty")}</p>;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <ol className="flex min-w-max">
        {steps.map((step, i) => {
          const def = ACTION_BY_VALUE[step.action];
          const channel = step.channel ?? def?.channel ?? "email";
          const ChannelIcon = CHANNEL_ICON[channel];
          const isLast = i === steps.length - 1;
          const reached = currentIndex < 0 || i <= currentIndex;
          return (
            <li key={step.id} className="relative w-36 shrink-0 pr-4">
              {/* The line to the next dot. */}
              {!isLast && <span aria-hidden className="absolute left-2.5 right-0 top-[5px] h-px" style={{ background: LINE }} />}
              <span
                aria-hidden
                className="relative block size-2.5 rounded-full border-2"
                style={{ borderColor: tone, background: reached ? tone : "var(--color-card)" }}
              />
              <div className="mt-2 min-w-0">
                <div className="flex items-start gap-1">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium" title={step.name}>
                    {step.name}
                  </p>
                  {onRemoveStep && (
                    <button type="button" onClick={() => onRemoveStep(step.id)} className="bee-btn-text h-auto shrink-0 p-0.5" aria-label={t("removeStepAria")}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)]">
                    {ChannelIcon && <ChannelIcon className="size-3" />}
                    {t.has(`channels.${channel}`) ? t(`channels.${channel}`) : channel}
                  </span>
                  <span className="bee-micro whitespace-nowrap">{t("day", { day: offsets[i] })}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
