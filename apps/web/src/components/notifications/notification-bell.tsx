"use client";

import { AlertCircle, Bell, Flame, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/notifications/build-notifications";

const KIND_ICON: Record<AppNotification["kind"], typeof Flame> = {
  hot_lead: Flame,
  hot_signal: Radio,
  review_required: AlertCircle,
};

const KIND_COLOR: Record<AppNotification["kind"], string> = {
  hot_lead: "var(--color-chart-5)",
  hot_signal: "var(--color-chart-2)",
  review_required: "var(--color-chart-1)",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.round(hours / 24)}d`;
}

/** Centro de notificaciones — se arma de datos reales (leads calientes, señales de alta intención, decisiones que requieren revisión). */
export function NotificationBell() {
  const { notifications, unreadCount, markAllSeen } = useNotifications();
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
        className="bee-rail-link relative"
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`}
      >
        <Bell className="size-4 shrink-0 stroke-[1.5]" />
        <span>Notificaciones</span>
        {unreadCount > 0 && (
          <span className="absolute right-2 top-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--color-chart-2)] text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-2 max-h-[70vh] w-80 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-[var(--color-background)] shadow-[0_8px_32px_rgba(34,34,34,0.16)]">
          <div className="sticky top-0 border-b border-border bg-[var(--color-background)] px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No hay novedades por ahora.
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
                        "flex items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--color-primary)]/30",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: KIND_COLOR[n.kind] }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.description}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(n.timestamp)}</p>
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
