"use client";

import { CalendarDays, Video } from "lucide-react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useMeetings } from "@/hooks/queries/use-meetings";
import { resolveTimezone } from "@/lib/timezone";
import { useAuth } from "@/providers/auth-provider";
import type { Locale } from "@/i18n/locales";
import type { MeetingClientContext } from "@/types/domain";

const CLIENT_CONTEXT_DOT: Record<MeetingClientContext, string> = {
  active_client: "var(--color-chart-4)",
  hot_lead: "var(--color-chart-1)",
  prospect: "var(--color-chart-6)",
  new_contact: "var(--color-chart-5)",
};

const UPCOMING_LIMIT = 5;

/**
 * "Mi calendario" — a compact personal upcoming-meetings list for the
 * Resumen/Overview pages, distinct from the full Calendario page (that one
 * is shared with the whole team — this is just "what's on MY plate next").
 * Same useMeetings query the full page uses, just filtered client-side to
 * this rep's own meetings (created by them or they're an invited
 * attendee) and capped to the next few. In the /probar sandbox there's no
 * real logged-in identity (useAuth().user is null there), so it falls back
 * to showing the next few meetings overall — still a real personal-
 * calendar preview, just not filtered by a fake "logged in as" identity.
 */
/** `embedded`: inside an OverviewCard, which renders the title and the
 *  "Ver todo" link itself — only the list comes from here. */
export function MyCalendarWidget({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const { user } = useAuth();
  const calendarHref = pathname?.startsWith("/probar") ? "/probar/calendar" : "/dashboard/calendar";
  const tz = resolveTimezone(user?.timezone);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const { data: meetings, isLoading } = useMeetings({ startsAfter: nowIso });

  const upcoming = useMemo(() => {
    const list = meetings ?? [];
    const mine = user
      ? list.filter((m) => m.created_by_user_id === user.id || m.attendee_user_ids.includes(user.id))
      : list;
    return mine.slice(0, UPCOMING_LIMIT);
  }, [meetings, user]);

  const list = isLoading ? (
    <p className="bee-caption">{t("page.loading")}</p>
  ) : upcoming.length === 0 ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center">
      <CalendarDays className="size-6 text-muted-foreground" />
      <p className="bee-caption">{t("widget.empty")}</p>
    </div>
  ) : (
    <ul className="bee-fill flex flex-col justify-evenly gap-2">
      {upcoming.map((m) => {
        const dotColor = m.color ? `var(--color-${m.color})` : CLIENT_CONTEXT_DOT[m.client_context ?? "new_contact"];
        return (
          <li key={m.id} className="bee-bento flex items-center gap-3 border-l-4 py-2 pl-3 pr-2" style={{ borderLeftColor: dotColor }}>
            <span className="bee-micro shrink-0 font-mono text-muted-foreground">
              {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: tz,
              }).format(new Date(m.starts_at))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{m.title}</span>
              {(m.company_name || m.contact_name) && <span className="block truncate bee-micro">{m.company_name ?? m.contact_name}</span>}
            </span>
            {m.meeting_url && <Video className="size-3 shrink-0 text-muted-foreground" />}
          </li>
        );
      })}
    </ul>
  );

  if (embedded) return list;

  return (
    <div className="bee-surface bee-bento-pad space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-[var(--color-chart-4)]" />
          <h2 className="bee-card-title">{t("widget.title")}</h2>
        </div>
        <Link href={calendarHref} className="bee-micro font-medium text-[var(--color-chart-4)] hover:underline">
          {t("widget.viewAll")}
        </Link>
      </div>

      {list}
    </div>
  );
}
