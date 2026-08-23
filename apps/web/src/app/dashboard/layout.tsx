"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AskBeeFab } from "@/components/assistant/ask-bee-fab";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { CommandPaletteProvider } from "@/components/command-palette/command-palette-context";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardRail } from "@/components/dashboard/dashboard-rail";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { FloatingCursors } from "@/components/presence/floating-cursors";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";
import { useAuth } from "@/providers/auth-provider";

/** Shell CRM — rail 52px + workspace + drawer lateral. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Avoid a flash of the (empty/401ing) dashboard while the session check —
  // or the redirect it just triggered — is still in flight.
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background">
        <p className="bee-caption">Cargando…</p>
      </div>
    );
  }

  return (
    <OpportunityDrawerProvider>
      <MobileNavProvider>
        <CommandPaletteProvider>
          <div className="bee-app">
            <DashboardRail />
            <div className="bee-main">
              <DashboardHeader />
              <div className="bee-scroll">{children}</div>
            </div>
            <OpportunityDrawer />
            <AskBeeFab />
            <FloatingCursors />
            <CommandPalette />
          </div>
        </CommandPaletteProvider>
      </MobileNavProvider>
    </OpportunityDrawerProvider>
  );
}
