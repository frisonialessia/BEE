"use client";

import { ChevronLeft, ChevronRight, Link2, Trash2, Users, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateMeeting, useDeleteMeeting, useMeetings, useUpdateMeeting } from "@/hooks/queries/use-meetings";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import type { MeetingCreateIn } from "@/lib/api/meetings";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { ApiError } from "@/types/api";
import type { Meeting, MeetingClientContext } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_CONTEXT_VARIANT: Record<MeetingClientContext, "success" | "warning" | "outline" | "secondary"> = {
  active_client: "success",
  hot_lead: "warning",
  prospect: "outline",
  new_contact: "secondary",
};
// Same pastel-fill tokens the marketing page's module tiles use
// (bee-bento--primary/--warm/--violet/--muted) — BEE's own palette, not a
// calendar-specific color scheme invented on the side.
const CLIENT_CONTEXT_TONE: Record<MeetingClientContext, string> = {
  active_client: "bee-bento--primary",
  hot_lead: "bee-bento--warm",
  prospect: "bee-bento--violet",
  new_contact: "bee-bento--muted",
};

// Hour-grid — business hours only (not a full 24h day) so a week's worth of
// meetings reads at a glance without scrolling past mostly-empty rows.
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;
const GRID_HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);
const HOUR_HEIGHT = 56; // px per hour row

/** Pixel top/height for one meeting block within the hour grid — clamped
 * to the visible window (a meeting outside business hours still shows,
 * pinned to the nearest edge, rather than disappearing entirely). */
function meetingPosition(meeting: Meeting): { top: number; height: number } {
  const start = new Date(meeting.starts_at);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = startHour + meeting.duration_minutes / 60;
  const clampedStart = Math.max(GRID_START_HOUR, Math.min(startHour, GRID_END_HOUR));
  const clampedEnd = Math.max(GRID_START_HOUR, Math.min(endHour, GRID_END_HOUR));
  const top = (clampedStart - GRID_START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(20, (clampedEnd - clampedStart) * HOUR_HEIGHT - 2);
  return { top, height };
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

function timeLabel(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    hour: "2-digit",
    minute: "2-digit",
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
  };
}

function formFromMeeting(meeting: Meeting): MeetingFormState {
  return {
    title: meeting.title,
    purpose: meeting.purpose ?? "",
    startsAt: toDatetimeLocalValue(new Date(meeting.starts_at)),
    durationMinutes: meeting.duration_minutes,
    meetingUrl: meeting.meeting_url ?? "",
    opportunityId: meeting.opportunity_id ?? "",
    leadId: meeting.lead_id ?? "",
    attendeeUserIds: meeting.attendee_user_ids,
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
}: {
  monthCursor: Date;
  onMonthChange: (next: Date) => void;
  weekDays: Date[];
  meetingDates: Set<string>;
  onSelectDay: (day: Date) => void;
  locale: Locale;
}) {
  const intlLocale = locale === "en" ? "en-US" : "es-MX";
  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const weekdayLabels = useMemo(
    () => grid.slice(0, 7).map((d) => new Intl.DateTimeFormat(intlLocale, { weekday: "narrow" }).format(d)),
    [grid, intlLocale],
  );
  const todayStr = new Date().toDateString();
  const weekDayStrs = new Set(weekDays.map((d) => d.toDateString()));

  return (
    <div className="bee-surface bee-bento-pad">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">
          {new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(monthCursor)}
        </p>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="bee-btn-ghost px-1.5"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="bee-btn-ghost px-1.5"
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
              } ${inMonth ? "" : "text-muted-foreground/40"} ${isToday ? "font-bold text-[var(--color-chart-4)]" : ""}`}
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

function TimeBreakdownBars({
  totals,
  grandTotal,
}: {
  totals: Record<MeetingClientContext, number>;
  grandTotal: number;
}) {
  const t = useTranslations("calendar");
  if (grandTotal === 0) return null;

  return (
    <div className="bee-surface bee-bento-pad space-y-2.5">
      <p className="bee-eyebrow">{t("sidebar.timeBreakdown")}</p>
      {CLIENT_CONTEXT_ORDER.filter((key) => totals[key] > 0).map((key) => {
        const pct = Math.round((totals[key] / grandTotal) * 100);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="bee-micro">{t(`clientContext.${key}`)}</span>
              <span className="bee-micro font-mono">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-card)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: CLIENT_CONTEXT_BAR_COLOR[key] }}
              />
            </div>
          </div>
        );
      })}
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<MeetingFormState>(() => emptyForm(new Date()));
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

  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS), [weekStart]);
  // Padded well past the visible week (~5 weeks either side) so the mini
  // month calendar's own meeting-dot markers have data too, without a
  // second query — one fetch backs both widgets.
  const queryStart = useMemo(() => new Date(weekStart.getTime() - 35 * DAY_MS), [weekStart]);
  const queryEnd = useMemo(() => new Date(weekStart.getTime() + 42 * DAY_MS), [weekStart]);
  const { data: allMeetings, isLoading } = useMeetings({
    startsAfter: queryStart.toISOString(),
    startsBefore: queryEnd.toISOString(),
  });
  const meetings = useMemo(
    () => (allMeetings ?? []).filter((m) => m.starts_at >= weekStart.toISOString() && m.starts_at < weekEnd.toISOString()),
    [allMeetings, weekStart, weekEnd],
  );
  const { data: users } = useUsers();
  const { data: oppsResult } = useOpportunities(undefined, 100);
  const { data: leadsResult } = useLeads(100);
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const day of days) map.set(day.toDateString(), []);
    for (const m of meetings ?? []) {
      const key = new Date(m.starts_at).toDateString();
      if (map.has(key)) map.get(key)!.push(m);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [meetings, days]);

  // Which calendar days (across the whole padded query range, not just
  // this week) have at least one meeting — the mini calendar's dots.
  const meetingDates = useMemo(
    () => new Set((allMeetings ?? []).map((m) => new Date(m.starts_at).toDateString())),
    [allMeetings],
  );

  // Minutes of this week's meetings by client_context — the sidebar's
  // "time breakdown" bars, same categories/colors the hour grid's blocks
  // already use (see CLIENT_CONTEXT_TONE), not a calendar-specific
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

  const today = new Date().toDateString();

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
    setForm(formFromMeeting(meeting));
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const body: MeetingCreateIn = {
      title: form.title.trim(),
      purpose: form.purpose.trim() || undefined,
      starts_at: new Date(form.startsAt).toISOString(),
      duration_minutes: form.durationMinutes,
      meeting_url: form.meetingUrl.trim() || undefined,
      opportunity_id: form.opportunityId || undefined,
      lead_id: form.leadId || undefined,
      attendee_user_ids: form.attendeeUserIds,
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
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("page.eyebrow")}</p>
          <div className="mt-1">
            <h1 className="bee-display">{t("page.title")}</h1>
            <p className="bee-caption mt-1">{t("page.caption")}</p>
          </div>
        </div>
        <button type="button" onClick={() => openCreateFor(new Date())} className="bee-btn bee-btn--primary text-xs">
          {t("page.newMeeting")}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4 lg:order-1">
          <MiniMonthCalendar
            monthCursor={monthCursor}
            onMonthChange={setMonthOverride}
            weekDays={days}
            meetingDates={meetingDates}
            onSelectDay={(day) => changeWeek(startOfWeek(day))}
            locale={locale}
          />
          <TimeBreakdownBars totals={timeBreakdown.totals} grandTotal={timeBreakdown.grandTotal} />
        </aside>

        <div className="lg:order-2">
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => changeWeek(startOfWeek(new Date()))} className="bee-btn-ghost text-xs">
          {t("page.today")}
        </button>
        <button
          type="button"
          onClick={() => changeWeek(new Date(weekStart.getTime() - 7 * DAY_MS))}
          aria-label={t("page.prevWeek")}
          className="bee-btn-ghost px-2"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => changeWeek(new Date(weekStart.getTime() + 7 * DAY_MS))}
          aria-label={t("page.nextWeek")}
          className="bee-btn-ghost px-2"
        >
          <ChevronRight className="size-4" />
        </button>
        <p className="bee-caption ml-1">
          {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" }).format(
            days[0],
          )}
          {" – "}
          {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short" }).format(
            days[6],
          )}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-[600px] rounded-[var(--radius-lg)]" />
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
                  className="absolute inset-x-0 border-t border-border/60 pr-1.5 text-right"
                  style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }}
                >
                  <span className="bee-micro relative -top-2 text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const dayMeetings = byDay.get(day.toDateString()) ?? [];
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
                    const pos = meetingPosition(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDetail(m)}
                        className={`bee-bento absolute inset-x-1 flex flex-col gap-0.5 overflow-hidden p-1.5 text-left ${CLIENT_CONTEXT_TONE[m.client_context ?? "new_contact"]}`}
                        style={{ top: pos.top, height: pos.height }}
                      >
                        <p className="bee-micro font-mono">{timeLabel(m.starts_at, locale)}</p>
                        <p className="line-clamp-2 text-xs font-medium leading-snug">{m.title}</p>
                        <div className="mt-auto flex items-center gap-1.5 text-muted-foreground">
                          {m.attendee_user_ids.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="size-3" />
                              <span className="bee-micro">{m.attendee_user_ids.length}</span>
                            </span>
                          )}
                          {m.meeting_url && <Video className="size-3" />}
                        </div>
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
                  {timeLabel(detail.starts_at, locale)} · {detail.duration_minutes} min
                </p>
                {detail.client_context && (
                  <Badge variant={CLIENT_CONTEXT_VARIANT[detail.client_context]} className="w-fit">
                    {t(`clientContext.${detail.client_context}`)}
                  </Badge>
                )}
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
                    className="flex w-fit items-center gap-1.5 text-sm font-medium text-[var(--color-chart-4)] hover:underline"
                  >
                    <Link2 className="size-3.5" />
                    {t("card.joinMeeting")}
                  </a>
                )}
                {detail.attendee_user_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.attendee_user_ids.map((uid) => {
                      const u = usersById.get(uid);
                      return (
                        <span
                          key={uid}
                          className="flex size-7 items-center justify-center rounded-full bg-[var(--color-chart-4)]/20 text-[11px] font-semibold text-[var(--color-chart-4)]"
                          title={u?.full_name}
                        >
                          {u ? initials(u.full_name) : "?"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <DialogFooter className="mt-2">
                <button type="button" onClick={() => setDetail(null)} className="bee-btn-ghost">
                  {t("detail.close")}
                </button>
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
            <div className="grid grid-cols-2 gap-2">
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
            <div className="grid grid-cols-2 gap-2">
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
              <div className="flex flex-wrap gap-1.5">
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
