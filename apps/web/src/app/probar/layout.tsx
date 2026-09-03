"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AskBeeFab } from "@/components/assistant/ask-bee-fab";
import { DashboardRail } from "@/components/dashboard/dashboard-rail";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { MobileNavToggle } from "@/components/dashboard/mobile-nav-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";
import { TourOverlay } from "@/features/tour/tour-overlay";
import { TourProvider, useTour } from "@/features/tour/tour-context";
import { buildTourSteps } from "@/features/tour/tour-steps";
import { useScrollResetOnNavigate } from "@/hooks/use-scroll-reset-on-navigate";
import { PROBAR_NAV_GROUPS } from "@/app/probar/nav-items";

/** Manual re-entry point for the guided tour — the sandbox has no
 * first-visit onboarding dialog to launch it from (that's dashboard-only,
 * see onboarding-tour-step.tsx), so it needs its own always-visible
 * trigger. Lives inside TourProvider, same as TourOverlay itself. */
function TourTriggerButton() {
  const { start } = useTour();
  const t = useTranslations("onboarding.tour");
  return (
    <button
      type="button"
      onClick={() => start(buildTourSteps("probar", (key) => t(`steps.${key}` as "steps.signals.title")))}
      className="bee-btn-ghost ml-auto hidden items-center gap-2 px-3 py-2 text-xs sm:inline-flex"
    >
      <Compass className="size-3.5" />
      {t("overlay.badge")}
    </button>
  );
}

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
  const scrollRef = useScrollResetOnNavigate<HTMLDivElement>();

  return (
    <TourProvider>
      <OpportunityDrawerProvider>
        <MobileNavProvider>
          <div className="bee-app">
            <DashboardRail groups={PROBAR_NAV_GROUPS} homeHref="/probar" />
            <div className="bee-main">
              <div className="shrink-0 border-b border-border bg-[var(--color-chart-4)] text-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                      className="bee-btn bee-btn--primary !bg-white !text-[var(--color-chart-4)] px-3 py-2 text-xs"
                    >
                      {t("createAccount")}
                    </Link>
                    <Link href="/contacto" className="bee-btn-ghost !border-white !text-white px-3 py-2 text-xs">
                      {t("contactUs")}
                    </Link>
                  </div>
                </div>
              </div>

              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
                <MobileNavToggle />
                <Link href="/probar" aria-label={t("homeAria")} className="flex items-center gap-3">
                  <Logo />
                </Link>
                <span className="bee-caption hidden sm:inline">{t("sandboxLabel")}</span>
                <TourTriggerButton />
                <LanguageSwitcher variant="subtle" className="hidden sm:inline-flex" />
              </header>

              <div className="bee-scroll" ref={scrollRef}>
                {children}
              </div>
            </div>
            <OpportunityDrawer />
            <AskBeeFab />
            <TourOverlay />
          </div>
        </MobileNavProvider>
      </OpportunityDrawerProvider>
    </TourProvider>
  );
}
