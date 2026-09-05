"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AskBeeFab } from "@/components/assistant/ask-bee-fab";
import { AccountMenuDemo } from "@/components/dashboard/account-menu-demo";
import { AssistantHeaderLink } from "@/components/dashboard/assistant-header-link";
import { DashboardRail } from "@/components/dashboard/dashboard-rail";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { MobileNavToggle } from "@/components/dashboard/mobile-nav-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TeamPresence } from "@/components/presence/presence-bar";
import { GlobalSearch } from "@/components/search/global-search";
import { Badge } from "@/components/ui/badge";
import { AssistantChatProvider } from "@/features/assistant/assistant-chat-context";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";
import { TourIntroPopup } from "@/features/tour/tour-intro-popup";
import { TourOverlay } from "@/features/tour/tour-overlay";
import { TourProvider } from "@/features/tour/tour-context";
import { useScrollResetOnNavigate } from "@/hooks/use-scroll-reset-on-navigate";
import { PROBAR_NAV_GROUPS } from "@/app/probar/nav-items";

/**
 * `/probar` — the no-login sandbox. Deliberately its own layout, not the
 * real `dashboard/layout.tsx`: that one redirects to `/login` when there's
 * no session, which is exactly the friction this route exists to skip.
 *
 * Reuses the real Dashboard's own rail/shell (`DashboardRail`,
 * `.bee-app`/`.bee-main`/`.bee-scroll`, the mobile hamburger nav) so the
 * sandbox has the same real, responsive navigation a paying customer sees
 * — just pointed at `/probar/*` routes (see `nav-items.ts`) instead of
 * `/dashboard/*`. Not every section is simulated yet (`PROBAR_LIVE_SECTIONS`
 * in `nav-items.ts`); the ones that aren't route to `ProbarComingSoon`,
 * which says so honestly instead of faking a working demo.
 */
export default function ProbarLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common.probarBanner");
  const tBadge = useTranslations("common.liveBadge");
  const scrollRef = useScrollResetOnNavigate<HTMLDivElement>();

  return (
    <TourProvider>
      <AssistantChatProvider>
      <OpportunityDrawerProvider>
        <MobileNavProvider>
          <div className="bee-app">
                <div className="bee-ground" aria-hidden="true"><i /><i /><i /></div>
            <DashboardRail groups={PROBAR_NAV_GROUPS} homeHref="/probar" />
            <div className="bee-main">
              <div className="shrink-0 border-b border-border bg-[var(--color-chart-4)] text-white">
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                  <p className="min-w-0 text-xs">
                    <strong className="font-semibold">{t("title")}</strong>
                    <span className="hidden sm:inline">{t("subtitle")}</span>
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href="/register"
                      // Tour target — the guided tour's closing step for
                      // /probar (see tour-steps.ts) points here.
                      data-tour="tour-create-account"
                      className="bee-btn bee-btn--primary !bg-white !text-[var(--color-text)] px-3 py-2 text-xs"
                    >
                      {t("createAccount")}
                    </Link>
                    <Link href="/contacto" className="bee-btn-ghost !bg-transparent !border-white !text-white px-3 py-2 text-xs">
                      {t("contactUs")}
                    </Link>
                  </div>
                </div>
              </div>

              {/* Same shape as the real DashboardHeader — search, the
                  assistant, the team, notifications, account — so the
                  sandbox reads like someone's own organization, not a
                  stripped-down preview. Only one swap: the account menu
                  is demo-sourced (no real session exists here to read
                  from). The guided tour has no header button at all —
                  see TourIntroPopup below, it offers itself once on a
                  new visitor's own. */}
              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-4 sm:px-5">
                <MobileNavToggle />
                <GlobalSearch className="max-w-[10rem] sm:max-w-xs md:max-w-sm" />
                <Badge variant="warning" className="hidden shrink-0 sm:inline-flex">{tBadge("demo")}</Badge>
                <div className="ml-auto flex items-center gap-2 sm:gap-4">
                  <AssistantHeaderLink />
                  <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />
                  <div className="hidden items-center gap-4 lg:flex">
                    <TeamPresence />
                    <div className="h-6 w-px bg-border" aria-hidden />
                  </div>
                  <NotificationBell />
                  <AccountMenuDemo />
                </div>
              </header>

              <div className="bee-scroll" ref={scrollRef}>
                {children}
              </div>
            </div>
            <OpportunityDrawer />
            <AskBeeFab />
            <TourOverlay />
            <TourIntroPopup mode="probar" />
          </div>
        </MobileNavProvider>
      </OpportunityDrawerProvider>
      </AssistantChatProvider>
    </TourProvider>
  );
}
