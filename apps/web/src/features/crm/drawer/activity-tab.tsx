"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarCheck, CalendarClock, CheckSquare, Flag, Radio, Sparkles, Target, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/locales";
import { getAuditDecisions } from "@/lib/api";
import { formatGenerator, getOpportunityStatusLabels } from "@/lib/format";
import { formatDateTimePadded } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Meeting, Opportunity, OpportunityTask, Signal } from "@/types/domain";

import { IconDisc } from "./primitives";
import { isClosedStatus } from "./stage-meta";

interface ActivityEvent {
  id: string;
  at: string;
  icon: LucideIcon;
  title: string;
  description: string | null;
}

/**
 * Actividad — one line per real event, newest first: the signal that
 * started it, the opportunity's creation, the strategy generation, every
 * agent decision from the audit trail, tasks marked done, meetings held
 * or scheduled, and the close. Nothing here is synthesized: if the API
 * (or the sandbox store) has no record of it, it isn't shown.
 */
export function ActivityTab({
  opportunity,
  signal,
  meetings,
  tasks,
  hue,
}: {
  opportunity: Opportunity;
  signal: Signal | null;
  meetings: Meeting[];
  tasks: OpportunityTask[];
  hue: string;
}) {
  const t = useTranslations("crm.drawer.activity");
  const tAgents = useTranslations("sharedB.timeline");
  const locale = useLocale() as Locale;
  const [expanded, setExpanded] = useState<string | null>(null);
  // Read the clock once per mount (same as crm-board) — the React Compiler
  // treats Date.now() in render as impure.
  const [now] = useState(() => Date.now());

  const { data: audit, isLoading } = useQuery({
    queryKey: ["audit", "decisions", { opportunity_id: opportunity.id, limit: 50 }],
    queryFn: () => getAuditDecisions({ opportunity_id: opportunity.id, limit: 50 }),
  });

  const events = useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = [];
    const statusLabels = getOpportunityStatusLabels(locale);

    if (signal) {
      out.push({ id: `signal-${signal.id}`, at: signal.detected_at, icon: Radio, title: t("signal"), description: signal.title });
    }
    out.push({ id: "created", at: opportunity.created_at, icon: Target, title: t("created"), description: null });

    const generatedAt = opportunity.strategy?.generated_at;
    if (typeof generatedAt === "string" && generatedAt) {
      const gen = typeof opportunity.strategy.generator === "string" ? formatGenerator(opportunity.strategy.generator, locale) : null;
      const conf = typeof opportunity.strategy.confidence_score === "number" ? t("confidence", { pct: Math.round(opportunity.strategy.confidence_score * 100) }) : null;
      out.push({ id: "strategy", at: generatedAt, icon: Sparkles, title: t("strategy"), description: [gen, conf].filter(Boolean).join(" · ") || null });
    }

    for (const entry of audit?.data ?? []) {
      const agent = tAgents.has(`agentLabels.${entry.agent_type}`) ? tAgents(`agentLabels.${entry.agent_type}`) : entry.agent_type;
      out.push({
        id: `audit-${entry.id}`,
        at: entry.created_at,
        icon: Bot,
        title: `${agent} · ${entry.decision_type.replace(/_/g, " ")}`,
        description: entry.strategy_reasoning,
      });
    }

    for (const task of tasks) {
      if (task.completed_at) {
        out.push({ id: `task-${task.id}`, at: task.completed_at, icon: CheckSquare, title: t("taskDone"), description: task.title });
      }
    }

    for (const m of meetings) {
      if (m.completed_at) {
        out.push({ id: `meeting-${m.id}`, at: m.completed_at, icon: CalendarCheck, title: t("meetingHeld"), description: m.title });
      } else if (new Date(m.starts_at).getTime() >= now) {
        out.push({ id: `meeting-${m.id}`, at: m.starts_at, icon: CalendarClock, title: t("meetingScheduled"), description: m.title });
      }
    }

    if (isClosedStatus(opportunity.status) && opportunity.closed_at) {
      out.push({ id: "closed", at: opportunity.closed_at, icon: Flag, title: t("closed", { status: statusLabels[opportunity.status] }), description: null });
    }

    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [opportunity, signal, meetings, tasks, audit, locale, now, t, tAgents]);

  if (isLoading && events.length <= 1) return <Skeleton className="h-32" />;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-[var(--color-divider)]" />
      {events.map((ev) => {
        const open = expanded === ev.id;
        const expandable = Boolean(ev.description);
        return (
          <li key={ev.id} className="relative">
            <div className="flex items-center gap-3 py-1.5">
              <span className="relative z-10 rounded-full ring-4 ring-[var(--color-background)]">
                <IconDisc icon={ev.icon} hue={hue} />
              </span>
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? t("collapse") : t("expand")}
                  onClick={() => setExpanded(open ? null : ev.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-chart-4)]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{ev.title}</span>
                  <span className="bee-micro shrink-0 tabular-nums">{formatDateTimePadded(ev.at, locale)}</span>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">
                  <span className="min-w-0 flex-1 truncate text-sm">{ev.title}</span>
                  <span className="bee-micro shrink-0 tabular-nums">{formatDateTimePadded(ev.at, locale)}</span>
                </div>
              )}
            </div>
            {open && ev.description && <p className="bee-caption mb-2 ml-11 pr-2">{ev.description}</p>}
          </li>
        );
      })}
    </ol>
  );
}
