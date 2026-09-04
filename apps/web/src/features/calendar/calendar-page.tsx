"use client";

import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Link2, Plus, Trash2, Users, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCompleteMeeting,
  useCreateMeeting,
  useDeleteMeeting,
  useMeetings,
  useRespondToMeeting,
  useUpdateMeeting,
} from "@/hooks/queries/use-meetings";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import type { MeetingCreateIn } from "@/lib/api/meetings";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { resolveTimezone, zonedFakeLocalDate, zonedWallClockToUtc } from "@/lib/timezone";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";
import type { Meeting, MeetingClientContext, MeetingColor } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_CONTEXT_VARIANT: Record<MeetingClientContext, "success" | "warning" | "outline" | "secondary"> = {
  active_client: "success",
  hot_lead: "warning",
  prospect: "outline",
  new_contact: "secondary",
};
// Calendar events are the one kind of box besides signal cards that carries a
// BEE fill: a personal color (Meeting.color) or, by default, the hue of the
// client context. Same 35% mix toward the background for both, so a
// default-colored event and a hand-colored one read as the same family.
const CLIENT_CONTEXT_HUE: Record<MeetingClientContext, string> = {
  active_client: "var(--color-chart-4)",
  hot_lead: "var(--color-chart-1)",
  prospect: "var(--color-chart-6)",
  new_contact: "var(--color-chart-5)",
};

function eventFill(m: { color?: string | null; client_context?: MeetingClientContext | null }): React.CSSProperties {
  const hue = m.color ? `var(--color-${m.color})` : CLIENT_CONTEXT_HUE[m.client_context ?? "new_contact"];
  return {
    background: `color-mix(in srgb, ${hue} 35%, var(--color-background))`,
    borderColor: `color-mix(in srgb, ${hue} 60%, var(--bee-card-border))`,
  };
}

// Hour-grid — business hours only (not a full 24h day) so a week's worth of
// meetings reads at a glance without scrolling past mostly-empty rows.
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;
const GRID_HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);
const HOUR_HEIGHT = 84; // px per hour row — a 30-min block (42px) keeps its title, 45 min adds the time range, an hour adds the account

/** Pixel top/height for one meeting block within the hour grid — clamped
 * to the visible window (a meeting outside business hours still shows,
 * pinned to the nearest edge, rather than disappearing entirely).
 * `timeZone` decides whose wall clock "top" is measured against — the
 * viewer's chosen timezone, not whatever the browser happens to be set
 * to (see zonedFakeLocalDate). */

/** "agosto de 2026" → "Agosto de 2026": only the first letter. Tailwind's
 *  `capitalize` upper-cased every word ("Agosto De 2026"). */
function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function meetingPosition(meeting: Meeting, timeZone: string): { top: number; height: number } {
  const start = zonedFakeLocalDate(new Date(meeting.starts_at), timeZone);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = startHour + meeting.duration_minutes / 60;
  const clampedStart = Math.max(GRID_START_HOUR, Math.min(startHour, GRID_END_HOUR));
  const clampedEnd = Math.max(GRID_START_HOUR, Math.min(endHour, GRID_END_HOUR));
  const top = (clampedStart - GRID_START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(20, (clampedEnd - clampedStart) * HOUR_HEIGHT - 2);
  return { top, height };
}

/** Side-by-side column assignment for meetings that overlap in time —
 * without this, two meetings booked at the same hour draw stacked exactly
 * on top of each other and one is effectively invisible/unclickable.
 * Standard greedy calendar layout: sort by start, give each meeting the
 * first column whose previous occupant has already ended; every meeting in
 * a connected run of overlaps then shares that run's column count so they
 * end up evenly divided instead of full-width. */
function layoutDayMeetings(
  meetings: Meeting[],
  tz: string,
): Map<string, { column: number; columns: number }> {
  const withRange = meetings
    .map((m) => {
      const pos = meetingPosition(m, tz);
      return { id: m.id, start: pos.top, end: pos.top + pos.height };
    })
    .sort((a, b) => a.start - b.start);

  const result = new Map<string, { column: number; columns: number }>();
  let clusterIds: string[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    for (const id of clusterIds) {
      const existing = result.get(id);
      if (existing) result.set(id, { column: existing.column, columns: columnEnds.length });
    }
    clusterIds = [];
    columnEnds = [];
  }

  for (const item of withRange) {
    if (item.start >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    result.set(item.id, { column, columns: 1 });
    clusterIds.push(item.id);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flushCluster();
  return result;
}

/** "GMT-5"/"GMT+1" style label — shown next to the week grid so it's clear
 * whose wall clock every meeting time on this page is in, same reasoning
 * the reference calendar shows it for. */
function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(
      new Date(),
    );
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The exact inverse of toDatetimeLocalValue — splits a "YYYY-MM-DDTHH:mm"
 *  string (this format is all both toDatetimeLocalValue and the native
 *  datetime-local input ever produce) back into numeric components, ready
 *  for zonedWallClockToUtc. `month` comes back 0-based, matching Date's
 *  own convention. */
function parseDatetimeLocalValue(value: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  return { year, month: month - 1, day, hour, minute };
}

function timeLabel(iso: string, locale: Locale, timeZone: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

interface MeetingFormState {
  title: string;
  purpose: string;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  opportunityId: string;
  leadId: string;
  attendeeUserIds: string[];
  color: MeetingColor | "";
}

function emptyForm(defaultStart: Date): MeetingFormState {
  return {
    title: "",
    purpose: "",
    startsAt: toDatetimeLocalValue(defaultStart),
    durationMinutes: 30,
    meetingUrl: "",
    opportunityId: "",
    leadId: "",
    attendeeUserIds: [],
    color: "",
  };
}

function formFromMeeting(meeting: Meeting, timeZone: string): MeetingFormState {
  return {
    title: meeting.title,
    purpose: meeting.purpose ?? "",
    startsAt: toDatetimeLocalValue(zonedFakeLocalDate(new Date(meeting.starts_at), timeZone)),
    durationMinutes: meeting.duration_minutes,
    meetingUrl: meeting.meeting_url ?? "",
    opportunityId: meeting.opportunity_id ?? "",
    leadId: meeting.lead_id ?? "",
    attendeeUserIds: meeting.attendee_user_ids,
    color: meeting.color ?? "",
  };
}

// Solid fills for the sidebar's time-breakdown bars — the hour grid's
// blocks use the pastel bee-bento--* tint classes (right for a filled
// card), but a 4px-tall bar needs a real color, not a pastel wash. Same
// chart-N variables the rest of the app already assigns to these ideas
// elsewhere (chart-1 = warm/hot, chart-4 = primary/blue, chart-5 = muted,
// chart-6 = violet).
const CLIENT_CONTEXT_BAR_COLOR: Record<MeetingClientContext, string> = {
  active_client: "var(--color-chart-4)",
  hot_lead: "var(--color-chart-1)",
  prospect: "var(--color-chart-6)",
  new_contact: "var(--color-chart-5)",
};
const CLIENT_CONTEXT_ORDER: MeetingClientContext[] = ["active_client", "hot_lead", "prospect", "new_contact"];
// The organizational color picker in the create/edit form — every color
// the app's chart palette defines, nothing calendar-specific invented.
const MEETING_COLORS: MeetingColor[] = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"];
// The three sales greens, offered apart: a closing meeting or a meeting
// with a won client — the same family Ventas and the CRM's Cerradas use.
const MEETING_GREENS: MeetingColor[] = ["green-1", "green-2", "green-3"];

/** "10:00–10:45" — 24h and compact, so a range fits a narrow day column. */
function rangeLabel(iso: string, durationMinutes: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  const start = new Date(iso);
  return `${fmt.format(start)}–${fmt.format(new Date(start.getTime() + durationMinutes * 60_000))}`;
}

const WEEKDAY_INITIALS: Record<Locale, string[]> = { es: ["L", "M", "M", "J", "V", "S", "D"], en: ["M", "T", "W", "T", "F", "S", "S"] };

/**
 * Sidebar "Desglose de tiempo" — one glance at the week: hours and count,
 * minutes per weekday (today in honey), the split by client context, the
 * accounts that take the most time, and how many meetings have a link or
 * no pipeline tie. All from the week's meetings already loaded.
 */
function TimeBreakdown({
  meetings,
  totals,
  grandTotal,
  days,
  todayStr,
  locale,
  tz,
}: {
  meetings: Meeting[];
  totals: Record<MeetingClientContext, number>;
  grandTotal: number;
  days: Date[];
  todayStr: string;
  locale: Locale;
  tz: string;
}) {
  const t = useTranslations("calendar");
  if (grandTotal === 0) return null;
  const hours = Math.round((grandTotal / 60) * 10) / 10;
  const byDay = days.map((d) => {
    const key = d.toDateString();
    return meetings.filter((m) => zonedFakeLocalDate(new Date(m.starts_at), tz).toDateString() === key).reduce((s, m) => s + m.duration_minutes, 0);
  });
  const maxDay = Math.max(1, ...byDay);
  const byAccount = new Map<string, number>();
  for (const m of meetings) {
    const key = m.company_name ?? m.contact_name;
    if (!key) continue;
    byAccount.set(key, (byAccount.get(key) ?? 0) + m.duration_minutes);
  }
  const topAccounts = [...byAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const withLink = meetings.filter((m) => m.meeting_url).length;
  const unlinked = meetings.filter((m) => !m.opportunity_id && !m.lead_id).length;
  const fmtMinutes = (min: number) => (min >= 60 ? t("sidebar.hours", { hours: Math.round((min / 60) * 10) / 10 }) : t("sidebar.minutes", { minutes: min }));

  return (
    <div className="bee-surface bee-bento-pad space-y-4">
      <div>
        <p className="bee-eyebrow">{t("sidebar.timeBreakdown")}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">{t("sidebar.weekTotal", { hours, count: meetings.length })}</p>
      </div>

      <div>
        <p className="bee-micro mb-1.5">{t("sidebar.byDay")}</p>
        <div className="flex items-end gap-1">
          {byDay.map((min, i) => {
            const isToday = days[i].toDateString() === todayStr;
            return (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" title={fmtMinutes(min)}>
                <div className="w-full rounded-[3px]" style={{ height: Math.max(4, Math.round((min / maxDay) * 40)), background: min === 0 ? "color-mix(in srgb, var(--color-text) 6%, transparent)" : isToday ? "var(--color-chart-1)" : "var(--color-chart-4)" }} />
                <span className={`bee-micro ${isToday ? "font-semibold text-[var(--color-text)]" : ""}`}>{WEEKDAY_INITIALS[locale][i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="bee-micro">{t("sidebar.byContext")}</p>
        {CLIENT_CONTEXT_ORDER.filter((key) => totals[key] > 0).map((key) => {
          const pct = Math.round((totals[key] / grandTotal) * 100);
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate bee-micro text-[var(--color-text)]">{t(`clientContext.${key}`)}</span>
                <span className="shrink-0 bee-micro tabular-nums">{fmtMinutes(totals[key])} · {pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CLIENT_CONTEXT_BAR_COLOR[key] }} />
              </div>
            </div>
          );
        })}
      </div>

      {topAccounts.length > 0 && (
        <div>
          <p className="bee-micro mb-1.5">{t("sidebar.byAccount")}</p>
          <ul className="space-y-1">
            {topAccounts.map(([name, min]) => (
              <li key={name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Building2 className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{name}</span>
                </span>
                <span className="shrink-0 bee-micro tabular-nums">{fmtMinutes(min)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-[color-mix(in_srgb,var(--color-chart-4)_18%,var(--color-card))] px-2 py-0.5 bee-micro text-[var(--color-text)]">
          <Video className="mr-1 inline size-3 align-[-2px]" />
          {t("sidebar.withLink", { count: withLink })}
        </span>
        {unlinked > 0 && (
          <span className="rounded-full bg-[color-mix(in_srgb,var(--color-chart-1)_22%,var(--color-card))] px-2 py-0.5 bee-micro text-[var(--color-text)]">
            {t("sidebar.unlinked", { count: unlinked })}
          </span>
        )}
      </div>
    </div>
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 6 full weeks (Monday-start) covering `monthCursor`'s month — always 42
 * cells so the grid's height never jumps between months with 4 vs 6 rows. */
function buildMonthGrid(monthCursor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(monthCursor));
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
}

function MiniMonthCalendar({
  monthCursor,
  onMonthChange,
  weekDays,
  meetingDates,
  onSelectDay,
  locale,
  todayStr,
}: {
  monthCursor: Date;
  onMonthChange: (next: Date) => void;
  weekDays: Date[];
  meetingDates: Set<string>;
  onSelectDay: (day: Date) => void;
  locale: Locale;
  todayStr: string;
}) {
  const intlLocale = locale === "en" ? "en-US" : "es-MX";
  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const weekdayLabels = useMemo(
    () => grid.slice(0, 7).map((d) => new Intl.DateTimeFormat(intlLocale, { weekday: "narrow" }).format(d)),
    [grid, intlLocale],
  );
  const weekDayStrs = new Set(weekDays.map((d) => d.toDateString()));

  return (
    <div className="bee-surface bee-bento-pad">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {sentenceCase(
            new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(monthCursor),
          )}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="bee-btn-ghost bee-btn--icon"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="bee-btn-ghost bee-btn--icon"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="bee-micro text-muted-foreground">
            {label}
          </span>
        ))}
        {grid.map((day) => {
          const inMonth = day.getMonth() === monthCursor.getMonth();
          const isToday = day.toDateString() === todayStr;
          const isSelectedWeek = weekDayStrs.has(day.toDateString());
          const hasMeeting = meetingDates.has(day.toDateString());
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`relative rounded-[var(--radius-sm)] py-1 text-xs transition-colors ${
                isSelectedWeek ? "bg-[var(--color-chart-4)]/15" : "hover:bg-[var(--color-primary)]/30"
              } ${inMonth ? "" : "text-muted-foreground"} ${isToday ? "font-bold text-[var(--color-chart-4)]" : ""}`}
            >
              {day.getDate()}
              {hasMeeting && (
                <span className="absolute inset-x-0 bottom-0.5 flex justify-center">
                  <span className="size-1 rounded-full bg-[var(--color-chart-4)]" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Full month grid — the calendar's other real gap besides overlap layout:
 * this page used to only ever render a week. Reuses buildMonthGrid (same
 * 42-cell, always-6-rows grid the mini calendar already builds) at full
 * size, with up to 3 meeting titles per day and a "+N" overflow count.
 * Clicking a day jumps back to the week view centered on it — this is a
 * navigation surface, not a second place to read a day's full schedule. */
function MonthGridView({
  monthCursor,
  meetingsByDay,
  onSelectDay,
  locale,
  todayStr,
}: {
  monthCursor: Date;
  meetingsByDay: Map<string, Meeting[]>;
  onSelectDay: (day: Date) => void;
  locale: Locale;
  todayStr: string;
}) {
  const intlLocale = locale === "en" ? "en-US" : "es-MX";
  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const weekdayLabels = useMemo(
    () => grid.slice(0, 7).map((d) => new Intl.DateTimeFormat(intlLocale, { weekday: "short" }).format(d)),
    [grid, intlLocale],
  );

  return (
    <div className="bee-surface overflow-x-auto rounded-[var(--radius-lg)]">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdayLabels.map((label, i) => (
          <p key={i} className="bee-eyebrow px-2 py-2 text-center">
            {label}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((day) => {
          const inMonth = day.getMonth() === monthCursor.getMonth();
          const isToday = day.toDateString() === todayStr;
          const dayMeetings = meetingsByDay.get(day.toDateString()) ?? [];
          const shown = dayMeetings.slice(0, 3);
          const overflow = dayMeetings.length - shown.length;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`min-h-24 border-b border-l border-border p-2 text-left align-top transition-colors hover:bg-[var(--color-primary)]/20 ${inMonth ? "" : "bg-muted/30"}`}
            >
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? "bg-[var(--color-chart-4)] font-bold text-white"
                    : inMonth
                      ? "font-medium"
                      : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {shown.map((m) => (
                  <p
                    key={m.id}
                    className="truncate rounded-md border px-2 py-1 text-xs font-medium"
                    style={eventFill(m)}
                  >
                    {m.title}
                  </p>
                ))}
                {overflow > 0 && <p className="bee-micro px-1 text-muted-foreground">+{overflow}</p>}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function SidebarProfileCard({ name, role, onQuickAdd }: { name: string; role: string; onQuickAdd: () => void }) {
  return (
    <div className="bee-surface flex items-center gap-4 bee-bento-pad">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-xs font-bold text-white">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate bee-micro capitalize">{role}</p>
      </div>
      <button
        type="button"
        onClick={onQuickAdd}
        aria-label="+"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-text)] text-background transition-opacity hover:opacity-85"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** Next meeting from now on, across the whole padded query window (not just
 * the visible week) — the reference calendar's "Upcoming event" card. Reads
 * off allMeetings, not the week-filtered `meetings`, so it still shows
 * something useful even while browsing a different week/month. */
function UpcomingEventCard({
  meeting,
  locale,
  tz,
  onOpen,
}: {
  meeting: Meeting;
  locale: Locale;
  tz: string;
  onOpen: () => void;
}) {
  const t = useTranslations("calendar");
  const day = zonedFakeLocalDate(new Date(meeting.starts_at), tz);
  const today = zonedFakeLocalDate(new Date(), tz).toDateString();
  const dateLabel =
    day.toDateString() === today
      ? t("sidebar.today")
      : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" }).format(day);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bee-surface block w-full bee-bento-pad text-left transition-colors hover:bg-[var(--color-primary)]/15"
    >
      <p className="bee-eyebrow">{t("sidebar.upcomingEvent")}</p>
      <div className="mt-2 flex items-center gap-2">
        {meeting.meeting_url ? (
          <Video className="size-4 shrink-0 text-[var(--color-chart-4)]" />
        ) : (
          <Users className="size-4 shrink-0 text-[var(--color-chart-4)]" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{meeting.title}</p>
          <p className="bee-micro">
            {dateLabel}, {timeLabel(meeting.starts_at, locale, tz)}
          </p>
        </div>
      </div>
    </button>
  );
}

/** "¿Vas a la reunión?" — an attendee accepting/declining an invite someone
 * else (a manager/CEO) booked for them, straight from BEE. Only ever shows
 * for a meeting the viewer is actually invited to and hasn't answered yet
 * (attendee_responses has no entry for them) — answering it removes it from
 * this slot, the next unanswered invite (if any) takes its place. Built to
 * connect to a real inbox later (Gmail or whatever email provider this
 * platform integrates) — for now, accepting/declining only updates BEE's
 * own record of the invite, nothing is sent anywhere yet. */
function RsvpWidget({
  meeting,
  locale,
  tz,
  onRespond,
  responding,
}: {
  meeting: Meeting;
  locale: Locale;
  tz: string;
  onRespond: (response: "accepted" | "declined") => void;
  responding: boolean;
}) {
  const t = useTranslations("calendar");
  return (
    <div className="bee-surface space-y-3 bee-bento-pad">
      <p className="bee-eyebrow">{t("sidebar.rsvpLabel")}</p>
      <p className="text-sm font-medium">{t("sidebar.rsvpQuestion", { title: meeting.title })}</p>
      <p className="bee-micro">{timeLabel(meeting.starts_at, locale, tz)}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onRespond("accepted")}
          disabled={responding}
          className="bee-btn bee-btn--primary flex-1 text-xs"
        >
          {t("sidebar.rsvpAccept")}
        </button>
        <button
          type="button"
          onClick={() => onRespond("declined")}
          disabled={responding}
          className="bee-btn-ghost flex-1 text-xs"
        >
          {t("sidebar.rsvpDecline")}
        </button>
      </div>
    </div>
  );
}

/** Calendario — vista semanal, cada reunión ligada opcionalmente a una
 *  oportunidad o un lead: client_context (Cliente activo/Lead caliente/
 *  Prospecto/Primer contacto) lo calcula el backend a partir de datos que
 *  BEE ya tiene, no se pide a mano. Página propia en el sidebar — ver
 *  nav-items.ts — real y simulado, mismo componente en ambos, ver
 *  lib/api/meetings.ts's isDemoMode() split). */
export function CalendarPage() {
  const t = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  // Every meeting time below is rendered/edited in *this* — the viewer's
  // own chosen timezone (User.timezone) if they set one, their browser's
  // detected zone otherwise (resolveTimezone). weekStart/days/the hour
  // grid all operate in this zone's wall-clock terms via the
  // zonedFakeLocalDate/zonedWallClockToUtc pair in lib/timezone — see
  // weekStartUtc below for where that gets bridged back to a real instant
  // for querying the API.
  //
  // resolveTimezone's browser-detected fallback (Intl.DateTimeFormat's own
  // resolvedOptions().timeZone) only exists client-side and can disagree
  // with whatever zone the Next.js server process happens to run in — a
  // classic hydration-mismatch source when nothing in `user` sets an
  // explicit timezone (true for the whole /probar sandbox, and for any
  // dashboard user who hasn't set one). Deferring the fallback to after
  // mount keeps the server render and the first client render in
  // agreement (both "UTC") — the real detected zone kicks in a frame
  // later, same standard fix as any other browser-only read.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // One-shot "we're past hydration now" flag — nothing to synchronize
    // with an external system, just the standard way to defer a
    // browser-only read past the first (SSR-matching) render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const tz = user?.timezone || (mounted ? resolveTimezone(undefined) : "UTC");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(zonedFakeLocalDate(new Date(), tz)));
  // "Day" isn't offered yet — the week grid already reads fine for a
  // single busy day (see the overlap layout above), and adding a third
  // view is separate scope from closing the "only ever a week" gap.
  const [view, setView] = useState<"week" | "month">("week");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<MeetingFormState>(() => emptyForm(zonedFakeLocalDate(new Date(), tz)));
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The mini month calendar follows whatever week the main grid is showing
  // — jumping weeks via "Hoy"/prev/next/a day click keeps both in sync,
  // via changeWeek() below clearing the override in the same event handler
  // — but browsing the mini calendar to a different month on its own
  // (peeking ahead, via its own prev/next month buttons) doesn't yank the
  // main grid along with it. No effect needed: both setState calls happen
  // together in one event handler, not chained across a render.
  const [monthOverride, setMonthOverride] = useState<Date | null>(null);
  const monthCursor = monthOverride ?? weekStart;
  function changeWeek(next: Date) {
    setWeekStart(next);
    setMonthOverride(null);
  }

  // weekStart above lives in "fake-local" wall-clock space (see its own
  // comment) — every place that actually talks to the API (the query
  // below, the meetings filter) needs a real UTC instant instead, which is
  // what bridges it back: the real moment "weekStart's Y/M/D, 00:00, in
  // tz" corresponds to. Once anchored to a real instant, plain millisecond
  // arithmetic for a week/N weeks later is exact — UTC has no DST to trip
  // over, unlike the fake-local side.
  const weekStartUtc = useMemo(
    () => zonedWallClockToUtc(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, tz),
    [weekStart, tz],
  );
  const weekEndUtc = useMemo(() => new Date(weekStartUtc.getTime() + 7 * DAY_MS), [weekStartUtc]);
  // Anchored to monthCursor (the 1st of whichever month is showing — the
  // mini calendar's own or, once monthOverride diverges from weekStart, a
  // month browsed ahead without jumping weeks), not weekStart — that's the
  // one query backing three widgets now (week grid, mini calendar dots,
  // full month grid), and month view needs data for a month that can be
  // well outside the visible week. Padded ~5 weeks either side of the 1st
  // so the always-42-cell month grid (which starts a few days before the
  // 1st and can run into the next month) is fully covered too.
  const queryAnchorUtc = useMemo(
    () => zonedWallClockToUtc(monthCursor.getFullYear(), monthCursor.getMonth(), 1, 0, 0, tz),
    [monthCursor, tz],
  );
  const queryStart = useMemo(() => new Date(queryAnchorUtc.getTime() - 35 * DAY_MS), [queryAnchorUtc]);
  const queryEnd = useMemo(() => new Date(queryAnchorUtc.getTime() + 42 * DAY_MS), [queryAnchorUtc]);
  const { data: allMeetings, isLoading } = useMeetings({
    startsAfter: queryStart.toISOString(),
    startsBefore: queryEnd.toISOString(),
  });
  const meetings = useMemo(
    () =>
      (allMeetings ?? []).filter(
        (m) => m.starts_at >= weekStartUtc.toISOString() && m.starts_at < weekEndUtc.toISOString(),
      ),
    [allMeetings, weekStartUtc, weekEndUtc],
  );
  const { data: users } = useUsers();
  const { data: oppsResult } = useOpportunities(undefined, 100);
  const { data: leadsResult } = useLeads(100);
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const completeMeeting = useCompleteMeeting();
  const respondToMeeting = useRespondToMeeting();

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const m of meetings ?? []) {
      // A real instant off the wire — convert to tz's wall-clock day so it
      // lands in the column the viewer actually reads as "that day",
      // matching `days`' own fake-local .toDateString() keys above.
      const key = zonedFakeLocalDate(new Date(m.starts_at), tz).toDateString();
      if (map.has(key)) map.get(key)!.push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [meetings, days, tz]);

  // Which calendar days (across the whole padded query range, not just
  // this week) have at least one meeting — the mini calendar's dots.
  const meetingDates = useMemo(
    () => new Set((allMeetings ?? []).map((m) => zonedFakeLocalDate(new Date(m.starts_at), tz).toDateString())),
    [allMeetings, tz],
  );

  // Minutes of this week's meetings by client_context — the sidebar's
  // "time breakdown" bars, same categories/colors the hour grid's blocks
  // already use (see CLIENT_CONTEXT_HUE), not a calendar-specific
  // taxonomy invented on the side.
  const timeBreakdown = useMemo(() => {
    const totals: Record<MeetingClientContext, number> = {
      active_client: 0,
      hot_lead: 0,
      prospect: 0,
      new_contact: 0,
    };
    for (const m of meetings) totals[m.client_context ?? "new_contact"] += m.duration_minutes;
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    return { totals, grandTotal };
  }, [meetings]);

  const today = zonedFakeLocalDate(new Date(), tz).toDateString();

  // Same shape as `byDay` but over the whole padded query window, not just
  // this week — what MonthGridView renders.
  const allByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of allMeetings ?? []) {
      const key = zonedFakeLocalDate(new Date(m.starts_at), tz).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [allMeetings, tz]);

  const nowIso = new Date().toISOString();
  const upcomingMeeting = useMemo(
    () => (allMeetings ?? []).find((m) => m.starts_at >= nowIso && m.completed_at === null),
    [allMeetings, nowIso],
  );
  // The first invite the viewer hasn't answered yet — see RsvpWidget's own
  // docstring for why this only ever shows one at a time.
  const pendingRsvpMeeting = useMemo(() => {
    if (!user) return undefined;
    return (allMeetings ?? []).find(
      (m) =>
        m.starts_at >= nowIso &&
        m.attendee_user_ids.includes(user.id) &&
        m.created_by_user_id !== user.id &&
        !(user.id in m.attendee_responses),
    );
  }, [allMeetings, nowIso, user]);

  function respondToRsvp(meetingId: string, response: "accepted" | "declined") {
    respondToMeeting.mutate(
      { id: meetingId, response },
      {
        onError: (err) => toast.error(err instanceof ApiError ? err.message : t("sidebar.rsvpError")),
      },
    );
  }

  function openCreateFor(day: Date) {
    const start = new Date(day);
    start.setHours(10, 0, 0, 0);
    setEditing(null);
    setForm(emptyForm(start));
    setFormOpen(true);
  }

  function openEdit(meeting: Meeting) {
    setDetail(null);
    setEditing(meeting);
    setForm(formFromMeeting(meeting, tz));
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const { year, month, day, hour, minute } = parseDatetimeLocalValue(form.startsAt);
    const body: MeetingCreateIn = {
      title: form.title.trim(),
      purpose: form.purpose.trim() || undefined,
      // form.startsAt is a bare "YYYY-MM-DDTHH:mm" string with no timezone
      // of its own — it means that wall-clock time *in tz*, not in
      // whatever zone the browser happens to be set to.
      starts_at: zonedWallClockToUtc(year, month, day, hour, minute, tz).toISOString(),
      duration_minutes: form.durationMinutes,
      meeting_url: form.meetingUrl.trim() || undefined,
      opportunity_id: form.opportunityId || undefined,
      lead_id: form.leadId || undefined,
      attendee_user_ids: form.attendeeUserIds,
      color: form.color || undefined,
    };
    try {
      if (editing) {
        await updateMeeting.mutateAsync({ id: editing.id, body });
      } else {
        await createMeeting.mutateAsync(body);
        toast.success(t("form.createSuccess"));
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(editing ? "form.updateError" : "form.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !window.confirm(t("form.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deleteMeeting.mutateAsync(editing.id);
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("form.deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleComplete(meeting: Meeting) {
    try {
      const updated = await completeMeeting.mutateAsync(meeting.id);
      setDetail(updated);
      toast.success(t("detail.completeSuccess"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("detail.completeError"));
    }
  }

  function toggleAttendee(userId: string) {
    setForm((f) => ({
      ...f,
      attendeeUserIds: f.attendeeUserIds.includes(userId)
        ? f.attendeeUserIds.filter((id) => id !== userId)
        : [...f.attendeeUserIds, userId],
    }));
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bee-eyebrow">{t("page.eyebrow")}</p>
          <div className="mt-1">
            <h1 className="bee-display">{t("page.title")}</h1>
            <p className="bee-caption mt-1">{t("page.caption")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openCreateFor(zonedFakeLocalDate(new Date(), tz))}
          className="bee-btn bee-btn--primary text-xs"
        >
          {t("page.newMeeting")}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4 lg:order-1">
          {user && (
            <SidebarProfileCard
              name={user.full_name}
              role={user.role}
              onQuickAdd={() => openCreateFor(zonedFakeLocalDate(new Date(), tz))}
            />
          )}
          {upcomingMeeting && (
            <UpcomingEventCard
              meeting={upcomingMeeting}
              locale={locale}
              tz={tz}
              onOpen={() => setDetail(upcomingMeeting)}
            />
          )}
          {pendingRsvpMeeting && (
            <RsvpWidget
              meeting={pendingRsvpMeeting}
              locale={locale}
              tz={tz}
              responding={respondToMeeting.isPending}
              onRespond={(response) => respondToRsvp(pendingRsvpMeeting.id, response)}
            />
          )}
          <MiniMonthCalendar
            monthCursor={monthCursor}
            onMonthChange={setMonthOverride}
            weekDays={days}
            meetingDates={meetingDates}
            onSelectDay={(day) => changeWeek(startOfWeek(day))}
            locale={locale}
            todayStr={today}
          />
          <TimeBreakdown meetings={meetings} totals={timeBreakdown.totals} grandTotal={timeBreakdown.grandTotal} days={days} todayStr={today} locale={locale} tz={tz} />
        </aside>

        <div className="lg:order-2">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="bee-filter-tabs">
          <button
            type="button"
            onClick={() => setView("week")}
            aria-pressed={view === "week"}
            className={view === "week" ? "bee-filter-tab bee-filter-tab--active" : "bee-filter-tab"}
          >
            {t("page.weekView")}
          </button>
          <button
            type="button"
            onClick={() => setView("month")}
            aria-pressed={view === "month"}
            className={view === "month" ? "bee-filter-tab bee-filter-tab--active" : "bee-filter-tab"}
          >
            {t("page.monthView")}
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            view === "week"
              ? changeWeek(startOfWeek(zonedFakeLocalDate(new Date(), tz)))
              : setMonthOverride(zonedFakeLocalDate(new Date(), tz))
          }
          className="bee-btn-ghost text-xs"
        >
          {t("page.today")}
        </button>
        <button
          type="button"
          onClick={() =>
            view === "week"
              ? changeWeek(new Date(weekStart.getTime() - 7 * DAY_MS))
              : setMonthOverride(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))
          }
          aria-label={t("page.prevWeek")}
          className="bee-btn-ghost bee-btn--icon"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            view === "week"
              ? changeWeek(new Date(weekStart.getTime() + 7 * DAY_MS))
              : setMonthOverride(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))
          }
          aria-label={t("page.nextWeek")}
          className="bee-btn-ghost bee-btn--icon"
        >
          <ChevronRight className="size-4" />
        </button>
        {view === "week" ? (
          <p className="bee-caption ml-1">
            {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" }).format(
              days[0],
            )}
            {" – "}
            {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" }).format(
              days[6],
            )}
          </p>
        ) : (
          <p className="bee-caption ml-1">
            {sentenceCase(
              new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { month: "long", year: "numeric" }).format(
                monthCursor,
              ),
            )}
          </p>
        )}
        {/* Whose wall clock every time on this page is in — see
            tzOffsetLabel's own docstring for why the reference this was
            built against shows it too. Client-only (mounted &&): Node's
            ICU and a browser's can format the same zone's shortOffset
            differently (observed: "GMT+0" server-side vs. "GMT"
            client-side for UTC) — a real cross-engine formatting gap, not
            a stale/drifting value, so there's no "right" SSR answer to
            match; rendering nothing until mount is what actually avoids
            the hydration mismatch, not just hides it. */}
        <span className="bee-caption ml-auto text-muted-foreground">
          {mounted ? tzOffsetLabel(tz) : null}
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-[600px] rounded-[var(--radius-lg)]" />
      ) : view === "month" ? (
        <MonthGridView
          monthCursor={monthCursor}
          meetingsByDay={allByDay}
          onSelectDay={(day) => {
            changeWeek(startOfWeek(day));
            setView("week");
          }}
          locale={locale}
          todayStr={today}
        />
      ) : (
        <div className="bee-surface overflow-x-auto rounded-[var(--radius-lg)]">
          <div className="grid min-w-[720px] grid-cols-[3.5rem_repeat(7,1fr)]">
            {/* Day headers */}
            <div />
            {days.map((day) => {
              const isToday = day.toDateString() === today;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => openCreateFor(day)}
                  className={`border-b border-l border-border px-2 py-2 text-left transition-colors hover:bg-[var(--color-primary)]/30 ${isToday ? "bg-[var(--color-chart-4)]/10" : ""}`}
                >
                  <p className="bee-eyebrow">
                    {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { weekday: "short" }).format(day)}
                  </p>
                  <p className={`text-sm font-semibold ${isToday ? "text-[var(--color-chart-4)]" : ""}`}>
                    {day.getDate()}
                  </p>
                </button>
              );
            })}

            {/* Hour grid */}
            <div className="relative" style={{ height: GRID_HOURS.length * HOUR_HEIGHT }}>
              {GRID_HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/60 pr-2 text-right"
                  style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                >
                  <span className="bee-micro relative -top-2 text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const dayMeetings = byDay.get(day.toDateString()) ?? [];
              const layout = layoutDayMeetings(dayMeetings, tz);
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-l border-border"
                  style={{ height: GRID_HOURS.length * HOUR_HEIGHT }}
                >
                  {GRID_HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}
                  {dayMeetings.map((m) => {
                    const pos = meetingPosition(m, tz);
                    // Overlapping meetings (e.g. two booked at the same hour)
                    // used to draw stacked exactly on top of each other, one
                    // effectively invisible/unclickable — layoutDayMeetings
                    // above splits them into side-by-side columns instead.
                    const { column, columns } = layout.get(m.id) ?? { column: 0, columns: 1 };
                    // A personal color (m.color) wins over the client_context
                    // tone when set — same color-mix() recipe globals.css's
                    // own bee-bento--* tint classes use, just parameterized
                    // by whichever chart color the rep picked.
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDetail(m)}
                        className="absolute flex flex-col gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 text-left"
                        style={{
                          top: pos.top,
                          height: pos.height,
                          left: `calc(${(column / columns) * 100}% + 2px)`,
                          width: `calc(${100 / columns}% - 4px)`,
                          ...eventFill(m),
                        }}
                      >
                        {/* What fits, in order of what a rep needs first: the
                            title always; the time range from ~56px; the account
                            from ~84px; attendees/link from ~108px. A short block
                            never hides the title behind the hour. */}
                        <p className={`${pos.height >= 56 ? "line-clamp-2" : "truncate"} text-xs font-semibold leading-snug`} title={m.title}>
                          {m.title}
                        </p>
                        {pos.height >= 56 && (
                          <p className="truncate bee-micro tabular-nums">
                            {rangeLabel(m.starts_at, m.duration_minutes, tz)} · {m.duration_minutes} min
                          </p>
                        )}
                        {pos.height >= 84 && (m.company_name || m.contact_name) && (
                          <p className="flex min-w-0 items-center gap-1 bee-micro">
                            <Building2 className="size-3 shrink-0" />
                            <span className="truncate">{m.company_name ?? m.contact_name}</span>
                          </p>
                        )}
                        {pos.height >= 108 && (
                          <div className="mt-auto flex items-center gap-2 text-muted-foreground">
                            {m.attendee_user_ids.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="size-3" />
                                <span className="bee-micro">{m.attendee_user_ids.length}</span>
                              </span>
                            )}
                            {m.meeting_url && <Video className="size-3" />}
                            {m.client_context && (
                              <span className="ml-auto truncate bee-micro">{t(`clientContext.${m.client_context}`)}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {dayMeetings.length === 0 && (
                    <p className="bee-micro px-2 py-2 text-muted-foreground">{t("page.emptyDay")}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="bee-display text-lg">{detail.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="bee-caption">
                  {timeLabel(detail.starts_at, locale, tz)} · {detail.duration_minutes} min
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {detail.client_context && (
                    <Badge variant={CLIENT_CONTEXT_VARIANT[detail.client_context]} className="w-fit">
                      {t(`clientContext.${detail.client_context}`)}
                    </Badge>
                  )}
                  {detail.completed_at && (
                    <Badge variant="success" className="w-fit gap-1">
                      <CheckCircle2 className="size-3" />
                      {t("detail.completed")}
                    </Badge>
                  )}
                </div>
                {(detail.company_name || detail.contact_name) && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("detail.with")}: </span>
                    {[detail.contact_name, detail.company_name].filter(Boolean).join(" — ")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{detail.purpose || t("detail.purposeEmpty")}</p>
                {detail.meeting_url && (
                  <a
                    href={detail.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-2 text-sm font-medium text-[var(--color-chart-4)] hover:underline"
                  >
                    <Link2 className="size-3.5" />
                    {t("card.joinMeeting")}
                  </a>
                )}
                {detail.attendee_user_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.attendee_user_ids.map((uid) => {
                      const u = usersById.get(uid);
                      return (
                        <span
                          key={uid}
                          className="flex size-7 items-center justify-center rounded-full bg-[var(--color-chart-4)]/20 text-micro font-semibold text-[var(--color-chart-4)]"
                          title={u?.full_name}
                        >
                          {u ? initials(u.full_name) : "?"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <DialogFooter className="mt-2 flex-wrap gap-2">
                <button type="button" onClick={() => setDetail(null)} className="bee-btn-ghost">
                  {t("detail.close")}
                </button>
                {!detail.completed_at && (
                  <button
                    type="button"
                    onClick={() => handleComplete(detail)}
                    disabled={completeMeeting.isPending}
                    className="bee-btn-ghost gap-2"
                  >
                    <CheckCircle2 className="size-3.5" />
                    {completeMeeting.isPending ? t("detail.completing") : t("detail.markComplete")}
                  </button>
                )}
                <button type="button" onClick={() => openEdit(detail)} className="bee-btn bee-btn--primary">
                  {t("detail.edit")}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/edit dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="bee-display text-lg">
              {editing ? t("form.editTitle") : t("form.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("form.titleLabel")}</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("form.titlePlaceholder")}
                required
                className="bee-input w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("form.purposeLabel")}</label>
              <textarea
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder={t("form.purposePlaceholder")}
                rows={3}
                className="bee-input w-full"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("form.startsAtLabel")}
                </label>
                <input
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  type="datetime-local"
                  required
                  className="bee-input w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("form.durationLabel")}
                </label>
                <input
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  className="bee-input w-full"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("form.meetingUrlLabel")}
              </label>
              <input
                value={form.meetingUrl}
                onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))}
                placeholder={t("form.meetingUrlPlaceholder")}
                className="bee-input w-full"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("form.linkOpportunityLabel")}
                </label>
                <select
                  value={form.opportunityId}
                  onChange={(e) => setForm((f) => ({ ...f, opportunityId: e.target.value, leadId: "" }))}
                  className="bee-input w-full"
                >
                  <option value="">{t("form.linkOpportunityNone")}</option>
                  {(oppsResult?.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {stripOpportunityTitlePrefix(o.title)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("form.linkLeadLabel")}
                </label>
                <select
                  value={form.leadId}
                  onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value, opportunityId: "" }))}
                  className="bee-input w-full"
                >
                  <option value="">{t("form.linkLeadNone")}</option>
                  {(leadsResult?.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("form.attendeesLabel")}
              </label>
              <div className="flex flex-wrap gap-2">
                {(users ?? []).map((u) => {
                  const active = form.attendeeUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAttendee(u.id)}
                      className={active ? "bee-btn-ghost bee-btn-ghost--active text-xs" : "bee-btn-ghost text-xs"}
                    >
                      {u.full_name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("form.colorLabel")}</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: "" }))}
                  aria-label={t("form.colorNone")}
                  aria-pressed={form.color === ""}
                  className={`flex size-6 items-center justify-center rounded-full border-2 ${form.color === "" ? "border-[var(--color-chart-4)]" : "border-transparent"}`}
                >
                  <span className="size-4 rounded-full border border-dashed border-muted-foreground" />
                </button>
                {MEETING_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={c}
                    aria-pressed={form.color === c}
                    className={`size-6 rounded-full border-2 transition-transform ${form.color === c ? "scale-110 border-[var(--color-text)]" : "border-transparent"}`}
                    style={{ background: `var(--color-${c})` }}
                  />
                ))}
                <span className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)]" aria-hidden="true" />
                {MEETING_GREENS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={t("form.colorGreen")}
                    aria-pressed={form.color === c}
                    className={`size-6 rounded-full border-2 transition-transform ${form.color === c ? "scale-110 border-[var(--color-text)]" : "border-transparent"}`}
                    style={{ background: `var(--color-${c})` }}
                  />
                ))}
              </div>
              <p className="mt-1 bee-micro">{t("form.colorHint")} {t("form.colorGreensHint")}</p>
            </div>

            <DialogFooter className="mt-2 flex items-center justify-between gap-2 sm:justify-between">
              {editing ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bee-btn-ghost text-xs text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  {deleting ? t("form.deleting") : t("form.delete")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setEditing(null);
                  }}
                  className="bee-btn-ghost"
                >
                  {t("form.cancel")}
                </button>
                <button type="submit" disabled={!form.title.trim() || saving} className="bee-btn bee-btn--primary">
                  {saving ? t("form.saving") : t("form.save")}
                </button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
