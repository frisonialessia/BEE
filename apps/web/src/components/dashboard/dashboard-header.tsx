"use client";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { AssistantHeaderLink } from "@/components/dashboard/assistant-header-link";
import { MobileNavToggle } from "@/components/dashboard/mobile-nav-toggle";
import { OnboardingHeaderButton } from "@/components/dashboard/onboarding-header-button";
import { CommandPaletteHint } from "@/components/command-palette/command-palette-hint";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TeamPresence } from "@/components/presence/presence-bar";
import { GlobalSearch } from "@/components/search/global-search";

/** Encabezado global del dashboard — menú (solo celular), búsqueda,
 *  asistente, presencia del equipo, notificaciones, cuenta. En pantallas
 *  chicas la presencia del equipo se oculta y el buscador se angosta para
 *  que quepa todo sin desbordar. */
export function DashboardHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-4 sm:px-5">
      <MobileNavToggle />
      <GlobalSearch className="max-w-[10rem] sm:max-w-xs md:max-w-sm" />
      <CommandPaletteHint />
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <OnboardingHeaderButton />
        <AssistantHeaderLink />
        <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        {/* lg, not md: at tablet width (768–1023px) the team strip plus the
            language switcher pushed the account menu ~50px past the right
            edge of the header. */}
        <div className="hidden items-center gap-4 lg:flex">
          <TeamPresence />
          <div className="h-6 w-px bg-border" aria-hidden />
        </div>
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
