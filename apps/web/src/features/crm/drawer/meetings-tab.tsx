"use client";

import { CalendarCheck, CalendarDays, Link2, Plus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useCreateMeeting } from "@/hooks/queries/use-meetings";
import type { Locale } from "@/i18n/locales";
import type { MeetingCreateIn } from "@/lib/api/meetings";
import { formatDateTime } from "@/lib/i18n/format";
import { resolveTimezone, zonedWallClockToUtc } from "@/lib/timezone";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";
import type { Meeting, MeetingColor, Opportunity } from "@/types/domain";
import type { UserOut } from "@/types/auth";

import { IconDisc } from "./primitives";

/** The meeting takes the stage's tone so the calendar reads like the board. */
const STAGE_MEETING_COLOR: Record<string, MeetingColor> = {
  detected: "chart-3",
  ready_to_action: "chart-1",
  prioritized: "chart-6",
  in_progress: "chart-4",
  won: "green-1",
};

function defaultStart(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

/** Reuniones — the deal's meetings as cards, plus "Crear reunión" on the
 *  same `useCreateMeeting` flow the Calendar page uses (same timezone
 *  handling: the wall-clock time means the user's zone, not the browser's). */
export function MeetingsTab({
  opportunity,
  meetings,
  users,
  hue,
  createOpen,
  onCreateOpenChange,
}: {
  opportunity: Opportunity;
  meetings: Meeting[];
  users: UserOut[];
  hue: string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("crm.drawer.meetings");
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const createMeeting = useCreateMeeting();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [duration, setDuration] = useState(30);
  const [url, setUrl] = useState("");

  const sorted = [...meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.full_name ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const [date, time] = startsAt.split("T");
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = (time ?? "09:00").split(":").map(Number);
    const tz = resolveTimezone(user?.timezone);
    const body: MeetingCreateIn = {
      title: title.trim(),
      starts_at: zonedWallClockToUtc(y, mo - 1, d, h, mi, tz).toISOString(),
      duration_minutes: duration,
      meeting_url: url.trim() || undefined,
      opportunity_id: opportunity.id,
      lead_id: opportunity.lead_id ?? undefined,
      attendee_user_ids: user ? [user.id] : [],
      color: STAGE_MEETING_COLOR[opportunity.status],
    };
    try {
      await createMeeting.mutateAsync(body);
      toast.success(t("created"));
      setTitle("");
      setUrl("");
      onCreateOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("error"));
    }
  }

  return (
    <div className="space-y-3">
      {createOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-card)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="bee-caption font-medium">{t("title")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)}  required className="bee-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="bee-caption font-medium">{t("when")}</span>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className="bee-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="bee-caption font-medium">{t("duration")}</span>
              <input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} className="bee-input" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="bee-caption font-medium">{t("link")}</span>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="bee-input" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onCreateOpenChange(false)} className="bee-btn-ghost !text-sm">
              {t("cancel")}
            </button>
            <button type="submit" disabled={!title.trim() || createMeeting.isPending} className="bee-btn bee-btn--primary !text-sm">
              {createMeeting.isPending ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => onCreateOpenChange(true)} className="bee-btn-ghost !text-sm">
          <Plus className="size-3.5" />
          {t("create")}
        </button>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => {
            const attendees = m.attendee_user_ids.map(nameOf).filter(Boolean) as string[];
            return (
              <li key={m.id} className="bee-surface flex items-start gap-3 p-3">
                <IconDisc icon={m.completed_at ? CalendarCheck : CalendarDays} hue={hue} size={32} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="bee-caption tabular-nums">
                    {formatDateTime(m.starts_at, locale)} · {m.duration_minutes} min
                    {m.completed_at && <span className="font-medium"> · {t("held")}</span>}
                  </p>
                  <p className="truncate text-sm font-medium">
                    {m.title}
                    {m.contact_name && <span className="font-normal text-muted-foreground"> · {m.contact_name}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {m.meeting_url && (
                      <a href={m.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline">
                        <Link2 className="size-3" />
                        {t("join")}
                      </a>
                    )}
                    {attendees.length > 0 && (
                      <span className="inline-flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <Users className="size-3" />
                        {attendees.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
