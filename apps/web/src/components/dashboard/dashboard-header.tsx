"use client";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { AssistantHeaderLink } from "@/components/dashboard/assistant-header-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TeamPresence } from "@/components/presence/presence-bar";
import { GlobalSearch } from "@/components/search/global-search";

/** Encabezado global del dashboard — búsqueda, asistente, presencia del
 *  equipo, notificaciones, cuenta. */
export function DashboardHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
      <GlobalSearch />
      <div className="flex items-center gap-3">
        <AssistantHeaderLink />
        <div className="h-6 w-px bg-border" aria-hidden />
        <TeamPresence />
        <div className="h-6 w-px bg-border" aria-hidden />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
