"use client";

import { AlertCircle, Bell, CalendarClock, Flame, Radio, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { TONE, tint } from "@/components/charts/palette";
import { useNotifications } from "@/hooks/use-notifications";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/notifications/build-notifications";

const KIND_ICON: Record<AppNotification["kind"], typeof Flame> = {
  hot_lead: Flame,
  hot_signal: Radio,
  review_required: AlertCircle,
  meeting_soon: CalendarClock,
  milestone: Trophy,
};

// Same tones TONE itself defines for these exact categories (see
// palette.ts's own docstrings) — not a new palette, just pointing each
// notification at the hue BEE already uses for that kind of thing
// everywhere else, so the bell reads with the rest of the app instead of
// its own invented scheme: a hot lead is urgency/priority, a hot signal is
// market detection, a "needs review" is something BEE prepared, a
// meeting is forecast/team (same tone milestone-path.tsx's own meeting
// badge uses), a milestone is the calm surface — never green, that's
// reserved for Ventas/CRM/Calendar's actual closed-money contexts.
const KIND_TONE: Record<AppNotification["kind"], string> = {
  hot_lead: TONE.urgency,
  hot_signal: TONE.market,
  review_required: TONE.prepared,
  meeting_soon: TONE.forecast,
  milestone: TONE.calm,
};


/** Campana de notificaciones — vive en el encabezado, no en el sidebar. */
export function NotificationBell() {
  const locale = useLocale() as Locale;
  const t = useTranslations("common.notificationBell");
  const { notifications, unreadCount, markAllSeen, isLoading } = useNotifications();
  // Pushes an immediate refetch of the sources above the moment a hot
  // signal/opportunity/meeting event happens (see that hook's own
  // docstring) — the bell otherwise only refreshed on its own 30s poll.
  useRealtimeNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) markAllSeen();
      return next;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground"
        aria-label={unreadCount > 0 ? t("ariaLabelUnread", { count: unreadCount }) : t("ariaLabel")}
      >
        <Bell className="size-4 stroke-[1.5]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[var(--color-chart-2)] text-micro font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="bee-glass absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-lg)]">
          <div className="sticky top-0 border-b border-border bg-[var(--color-background)] px-4 py-3">
            <p className="text-sm font-semibold">{t("title")}</p>
          </div>
          {isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("loading")}</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul>
              {notifications.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <li key={n.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--color-primary)]/30",
                      )}
                    >
                      {/* Color lives on the badge's tinted background, not
                          the icon glyph — a directly-colored icon is the
                          one thing BEE's palette rule never allows (see
                          DESIGN_BRIEF.md rule 4). */}
                      <span
                        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                        style={{ background: tint(KIND_TONE[n.kind], 45) }}
                      >
                        <Icon className="size-3.5 text-[var(--color-text)]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{n.title}</p>
                        <p className="mt-1 line-clamp-2 bee-micro">
                          {n.description}
                        </p>
                        <p className="mt-1 bee-micro">{formatRelativeTime(n.timestamp, locale)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
