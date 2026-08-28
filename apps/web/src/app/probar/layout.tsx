"use client";

import Link from "next/link";

import { Logo } from "@/components/logo";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";

/**
 * `/probar` — the no-login sandbox. Deliberately its own layout, not the
 * real `dashboard/layout.tsx`: that one redirects to `/login` when there's
 * no session, which is exactly the friction this route exists to skip. The
 * page content underneath (`page.tsx`) reuses the real dashboard's
 * `SignalsDashboard` / `CrmView` / opportunity drawer components unmodified
 * — only `lib/api/*` is demo-aware (see `lib/demo/mode.ts`), so this is the
 * real product pointed at a local dataset, not a separate mock.
 */
export default function ProbarLayout({ children }: { children: React.ReactNode }) {
  return (
    <OpportunityDrawerProvider>
      <div className="min-h-full bg-background">
        <div className="sticky top-0 z-40 border-b border-border bg-[var(--color-chart-4)] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-xs sm:text-sm">
              <strong className="font-semibold">Estás probando BEE con datos de ejemplo</strong>
              <span className="hidden sm:inline"> — guardados solo en este navegador, nunca en nuestra base de datos.</span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Link href="/register" className="bee-btn bee-btn--primary !bg-white !text-[var(--color-chart-4)] px-3 py-1.5 text-xs">
                Crear cuenta gratis
              </Link>
              <Link href="/contacto" className="bee-btn-ghost !border-white !text-white px-3 py-1.5 text-xs">
                Contactanos
              </Link>
            </div>
          </div>
        </div>

        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
            <Link href="/" aria-label="BEE — inicio">
              <Logo />
            </Link>
            <span className="bee-caption">Sandbox de prueba</span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>

        <OpportunityDrawer />
      </div>
    </OpportunityDrawerProvider>
  );
}
