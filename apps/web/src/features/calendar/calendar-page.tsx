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

/** Calendario — vista semanal, cada reunión ligada opcionalmente a una
 *  oportunidad o un lead: client_context (Cliente activo/Lead caliente/
 *  Prospecto/Primer contacto) lo calcula el backend a partir de datos que
 *  BEE ya tiene, no se pide a mano. Página propia en el sidebar — ver
 *  nav-items.ts (solo /dashboard, todavía sin soporte en /probar). */
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

  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS), [weekStart]);
  const { data: meetings, isLoading } = useMeetings({
    startsAfter: weekStart.toISOString(),
    startsBefore: weekEnd.toISOString(),
  });
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

      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="bee-btn-ghost text-xs">
          {t("page.today")}
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}
          aria-label={t("page.prevWeek")}
          className="bee-btn-ghost px-2"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => {
            const dayMeetings = byDay.get(day.toDateString()) ?? [];
            const isToday = day.toDateString() === today;
            return (
              <div key={day.toISOString()} className="flex min-h-[240px] flex-col">
                <button
                  type="button"
                  onClick={() => openCreateFor(day)}
                  className={`mb-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-primary)]/40 ${isToday ? "bg-[var(--color-chart-4)]/15" : ""}`}
                >
                  <p className="bee-eyebrow">
                    {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", { weekday: "short" }).format(day)}
                  </p>
                  <p className={`text-sm font-semibold ${isToday ? "text-[var(--color-chart-4)]" : ""}`}>
                    {day.getDate()}
                  </p>
                </button>
                <div className="flex flex-1 flex-col gap-1.5">
                  {dayMeetings.length === 0 ? (
                    <p className="bee-micro px-1 text-muted-foreground">{t("page.emptyDay")}</p>
                  ) : (
                    dayMeetings.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDetail(m)}
                        className="bee-bento flex flex-col gap-1 p-2 text-left"
                      >
                        <p className="bee-micro font-mono">{timeLabel(m.starts_at, locale)}</p>
                        <p className="line-clamp-2 text-xs font-medium leading-snug">{m.title}</p>
                        {m.client_context && (
                          <Badge variant={CLIENT_CONTEXT_VARIANT[m.client_context]} className="w-fit text-[10px]">
                            {t(`clientContext.${m.client_context}`)}
                          </Badge>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                          {m.attendee_user_ids.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="size-3" />
                              <span className="bee-micro">{m.attendee_user_ids.length}</span>
                            </span>
                          )}
                          {m.meeting_url && <Video className="size-3" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
