"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  FileText,
  Flag,
  Pencil,
  Radio,
  Sparkles,
  Target,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { getAuditDecisions } from "@/lib/api";
import { formatGenerator, getOpportunityStatusLabels, stripOpportunityTitlePrefix } from "@/lib/format";
import { formatDate, formatDateTimePadded, formatLongDate, formatMoney } from "@/lib/i18n/format";
import type { UserOut } from "@/types/auth";
import type { Meeting, Opportunity, OpportunityTask, Signal } from "@/types/domain";

import { DATA } from "@/components/charts/palette";

import { Avatar, Chip, IconDisc } from "./primitives";
import { isClosedStatus, stepOf } from "./stage-meta";

const LATEST_COLLAPSED = 4;
const UPCOMING_MAX = 2;

interface ActivityEvent {
  id: string;
  at: string;
  icon: LucideIcon;
  title: string;
  description: string | null;
}

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  contact: string | null;
  place: { icon: LucideIcon; label: string } | null;
  ownerId: string | null;
}

/** Section header — title left, one optional action right. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="bee-card-title !mb-0">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Actividad — the deal at a glance, in three blocks (the reference's
 * "Latest activity · Appointments · Proposals"):
 *
 *  1. what happened, newest first — only recorded events: the signal, the
 *     creation, the strategy, agent decisions from the audit trail, tasks
 *     done, meetings held, the close. Nothing here is synthesized;
 *  2. what's scheduled — the next meeting(s) as a card; upcoming meetings
 *     live here, never repeated in the list above;
 *  3. the money — amount, expected close and stage as the "proposal" card.
 */
export function ActivityTab({
  opportunity,
  companyName,
  signal,
  meetings,
  tasks,
  users,
  hue,
  onCreateMeeting,
  onEditAmount,
}: {
  opportunity: Opportunity;
  companyName: string | null;
  signal: Signal | null;
  meetings: Meeting[];
  tasks: OpportunityTask[];
  users: UserOut[];
  hue: string;
  onCreateMeeting: () => void;
  onEditAmount: () => void;
}) {
  const t = useTranslations("crm.drawer.activity");
  const tDrawer = useTranslations("crm.drawer");
  const tBoard = useTranslations("crm.board");
  const tAgents = useTranslations("sharedB.timeline");
  const locale = useLocale() as Locale;
  const [showAll, setShowAll] = useState(false);
  // Read the clock once per mount (same as crm-board) — the React Compiler
  // treats Date.now() in render as impure.
  const [now] = useState(() => Date.now());
  const closed = isClosedStatus(opportunity.status);

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
    out.push({ id: "created", at: opportunity.created_at, icon: Target, title: t("created"), description: companyName });

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
      }
    }

    if (closed && opportunity.closed_at) {
      out.push({ id: "closed", at: opportunity.closed_at, icon: Flag, title: t("closed", { status: statusLabels[opportunity.status] }), description: null });
    }

    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [opportunity, companyName, signal, meetings, tasks, audit, locale, closed, t, tAgents]);

  const upcoming = useMemo<Appointment[]>(() => {
    const list = meetings
      .filter((m) => !m.completed_at && new Date(m.starts_at).getTime() >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, UPCOMING_MAX)
      .map<Appointment>((m) => ({
        id: m.id,
        startsAt: m.starts_at,
        endsAt: new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60_000).toISOString(),
        title: m.title,
        contact: m.contact_name,
        place: m.meeting_url ? { icon: Video, label: t("video") } : m.company_name ? { icon: Building2, label: m.company_name } : null,
        ownerId: m.created_by_user_id,
      }));
    if (list.length === 0 && opportunity.next_meeting_at && new Date(opportunity.next_meeting_at).getTime() >= now) {
      list.push({
        id: "next-meeting-at",
        startsAt: opportunity.next_meeting_at,
        endsAt: null,
        title: tDrawer("next.date"),
        contact: null,
        place: companyName ? { icon: Building2, label: companyName } : null,
        ownerId: opportunity.assigned_to_user_id,
      });
    }
    return list;
  }, [meetings, opportunity, companyName, now, t, tDrawer]);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat(localeTags[locale], { hour: "numeric", minute: "2-digit" }), [locale]);
  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(localeTags[locale], { weekday: "long" }), [locale]);

  const visible = showAll ? events : events.slice(0, LATEST_COLLAPSED);
  const stageWord = closed
    ? tBoard(`closedStatus.${opportunity.status as "won" | "lost" | "dismissed"}`)
    : tBoard(`stages.${stepOf(opportunity.status)}`);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Actividad reciente ─────────────────────────────────────────── */}
      <Section title={t("latest")}>
        {isLoading && events.length <= 1 ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <ol className="relative">
              <span aria-hidden className="absolute bottom-4 left-[13px] top-4 w-px bg-[var(--color-divider)]" />
              {visible.map((ev) => (
                <li key={ev.id} className="relative flex items-start gap-3 py-2">
                  <span className="relative z-10 rounded-full ring-4 ring-[var(--color-background)]">
                    <IconDisc icon={ev.icon} />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{ev.title}</p>
                      <span className="bee-micro shrink-0 tabular-nums">{formatDateTimePadded(ev.at, locale)}</span>
                    </div>
                    {ev.description && (
                      <p className="bee-caption truncate" title={ev.description}>
                        {ev.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {events.length > LATEST_COLLAPSED && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-11 self-start text-sm font-medium text-[var(--color-text)] underline-offset-2 hover:underline">
                {showAll ? t("showLess") : t("showMore", { count: events.length - LATEST_COLLAPSED })}
              </button>
            )}
          </>
        )}
      </Section>

      {/* ── Próximas reuniones ─────────────────────────────────────────── */}
      <Section
        title={t("upcoming")}
        action={
          <button type="button" onClick={onCreateMeeting} className="bee-btn-ghost !h-8 !text-sm">
            <CalendarPlus className="size-3.5" />
            {tDrawer("actions.calendar")}
          </button>
        }
      >
        {upcoming.length === 0 ? (
          <div className="bee-surface flex items-center gap-3 p-4">
            <IconDisc icon={CalendarClock} size={32} />
            <p className="flex-1 text-sm text-muted-foreground">{t("noUpcoming")}</p>
          </div>
        ) : (
          upcoming.map((a) => {
            const owner = a.ownerId ? users.find((u) => u.id === a.ownerId) ?? null : null;
            const start = new Date(a.startsAt);
            return (
              <div key={a.id} className="bee-surface grid gap-4 p-4 sm:grid-cols-[minmax(0,11rem)_1fr]">
                <div className="leading-tight sm:border-r sm:border-[var(--color-divider)] sm:pr-4">
                  <p className="bee-caption font-medium capitalize text-[var(--color-text)]">{weekdayFmt.format(start)}</p>
                  <p className="text-base font-bold">{formatLongDate(start, locale)}</p>
                  <p className="bee-caption mt-1 tabular-nums">
                    {timeFmt.format(start)}
                    {a.endsAt && ` – ${timeFmt.format(new Date(a.endsAt))}`}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 leading-tight">
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: hue }} />
                    <span className="truncate font-semibold">{a.title}</span>
                    {a.contact && <span className="truncate text-muted-foreground">{t("with", { name: a.contact })}</span>}
                  </p>
                  {a.place && (
                    <p className="bee-caption flex items-center gap-2">
                      <a.place.icon className="size-3.5 shrink-0 stroke-[1.5]" />
                      <span className="truncate">{a.place.label}</span>
                    </p>
                  )}
                  {owner && (
                    <p className="bee-caption flex items-center gap-2">
                      <Avatar name={owner.full_name} size={20} photoUrl={owner.avatar_url} />
                      <span className="truncate">{owner.full_name}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Section>

      {/* ── Propuesta: monto · cierre · etapa ───────────────────────────── */}
      <Section
        title={t("proposal")}
        action={
          !closed ? (
            <button type="button" onClick={onEditAmount} className="bee-btn-ghost !h-8 !text-sm">
              <Pencil className="size-3.5" />
              {t("update")}
            </button>
          ) : undefined
        }
      >
        <div className="bee-surface grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 leading-tight">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 stroke-[1.5]" />
              <span className="shrink-0 font-semibold tabular-nums">#{opportunity.id.slice(0, 6)}</span>
              <span className="truncate font-medium">{stripOpportunityTitlePrefix(opportunity.title)}</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="bee-caption">{t("createdDate")}</p>
                <p className="text-sm tabular-nums">{formatDate(opportunity.created_at, locale)}</p>
              </div>
              <div>
                <p className="bee-caption">{t("closeDate")}</p>
                <p className="text-sm tabular-nums">{opportunity.expected_close_date ? formatDate(opportunity.expected_close_date, locale) : "—"}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 leading-tight sm:min-w-40 sm:border-l sm:border-[var(--color-divider)] sm:pl-4">
            <p className="bee-caption">{t("amount")}</p>
            <p className="text-lg font-bold tabular-nums">
              {opportunity.amount != null ? formatMoney(opportunity.amount, "USD", locale) : t("noAmount")}
            </p>
            <div>
              <Chip hue={DATA.lavender}>{stageWord}</Chip>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
