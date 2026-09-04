"use client";

import { ArrowUpRight, CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import type { Locale } from "@/i18n/locales";
import { formatChannel, formatNextBestAction, formatPlaybook } from "@/lib/format";
import { formatDateTime } from "@/lib/i18n/format";
import type { Meeting, Opportunity, OpportunityTask } from "@/types/domain";

/** What's scheduled next, from real records only: the earliest upcoming
 *  meeting, else the next open task with a due date, else the deal's own
 *  `next_meeting_at`. */
export function nextScheduled(
  opportunity: Opportunity,
  meetings: Meeting[],
  tasks: OpportunityTask[],
  now: number,
): { kind: "meeting" | "task" | "date"; title: string; at: string } | null {
  const meeting = meetings
    .filter((m) => !m.completed_at && new Date(m.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (meeting) return { kind: "meeting", title: meeting.title, at: meeting.starts_at };
  const task = tasks
    .filter((tk) => !tk.completed_at && tk.due_at)
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))[0];
  if (task?.due_at) return { kind: "task", title: task.title, at: task.due_at };
  if (opportunity.next_meeting_at && new Date(opportunity.next_meeting_at).getTime() >= now) {
    return { kind: "date", title: "", at: opportunity.next_meeting_at };
  }
  return null;
}

/** Two read-only cells on one white card: BEE's next best action (from the
 *  strategy) · the next scheduled step (meeting / task / date). The actions
 *  themselves live in the header (primary button, calendar) — never here. */
export function NextStepStrip({ opportunity, meetings, tasks }: { opportunity: Opportunity; meetings: Meeting[]; tasks: OpportunityTask[] }) {
  const t = useTranslations("crm.drawer.next");
  const locale = useLocale() as Locale;
  const { strategy } = opportunity;
  const action = typeof strategy?.next_best_action === "string" ? strategy.next_best_action : null;
  const channel = typeof strategy?.channel === "string" ? strategy.channel : null;
  const playbook = typeof strategy?.playbook === "string" ? strategy.playbook : null;
  // Clock read once per mount — Date.now() in render is impure for the compiler.
  const [now] = useState(() => Date.now());
  const next = nextScheduled(opportunity, meetings, tasks, now);

  return (
    <div className="bee-surface grid grid-cols-1 sm:grid-cols-2">
      <div className="min-w-0 px-4 py-3 leading-tight">
        <p className="bee-caption flex items-center gap-1.5">
          <ArrowUpRight className="size-3.5 stroke-[1.5]" />
          {t("action")}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium">{action ? formatNextBestAction(action, locale) : "—"}</p>
        {(channel || playbook) && (
          <p className="truncate text-sm text-muted-foreground">
            {[channel && formatChannel(channel, locale), playbook && formatPlaybook(playbook, locale)].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="min-w-0 border-t border-[var(--color-divider)] px-4 py-3 leading-tight sm:border-l sm:border-t-0">
        <p className="bee-caption flex items-center gap-1.5">
          <CalendarClock className="size-3.5 stroke-[1.5]" />
          {t("step")}
        </p>
        {next ? (
          <>
            <p className="mt-0.5 truncate text-sm font-medium">{next.title || t(next.kind)}</p>
            <p className="truncate text-sm tabular-nums text-muted-foreground">
              {next.title ? `${t(next.kind)} · ` : ""}
              {formatDateTime(next.at, locale)}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">{t("none")}</p>
        )}
      </div>
    </div>
  );
}
