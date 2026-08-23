"use client";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TeamPresence } from "@/components/presence/presence-bar";

/** Encabezado global del dashboard — presencia del equipo, notificaciones, cuenta. */
export function DashboardHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-border px-5">
      <TeamPresence />
      <div className="h-6 w-px bg-border" aria-hidden />
      <NotificationBell />
      <AccountMenu />
    </header>
  );
}
