"use client";

import Link from "next/link";

import { AskBeeFab } from "@/components/assistant/ask-bee-fab";
import { DashboardRail } from "@/components/dashboard/dashboard-rail";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { MobileNavToggle } from "@/components/dashboard/mobile-nav-toggle";
import { Logo } from "@/components/logo";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";
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
  return (
    <OpportunityDrawerProvider>
      <MobileNavProvider>
        <div className="bee-app">
          <DashboardRail groups={PROBAR_NAV_GROUPS} homeHref="/probar" />
          <div className="bee-main">
            <div className="shrink-0 border-b border-border bg-[var(--color-chart-4)] text-white">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 text-xs">
                  <strong className="font-semibold">Estás probando BEE con datos de ejemplo</strong>
                  <span className="hidden sm:inline"> — guardados solo en este navegador, nunca en nuestra base de datos.</span>
                </p>
                <div className="flex shrink-0 gap-2">
                  <Link href="/register" className="bee-btn bee-btn--primary !bg-white !text-[var(--color-chart-4)] px-3 py-1.5 text-xs">
                    Crear cuenta gratis
                  </Link>
                  <Link href="/contacto" className="bee-btn-ghost !border-white !text-white px-3 py-1.5 text-xs">
                    Contáctanos
                  </Link>
                </div>
              </div>
            </div>

            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
              <MobileNavToggle />
              <Link href="/probar" aria-label="BEE — inicio" className="flex items-center gap-2.5">
                <Logo />
              </Link>
              <span className="bee-caption hidden sm:inline">Sandbox de prueba</span>
            </header>

            <div className="bee-scroll">{children}</div>
          </div>
          <OpportunityDrawer />
          <AskBeeFab />
        </div>
      </MobileNavProvider>
    </OpportunityDrawerProvider>
  );
}
