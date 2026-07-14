"use client";

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";

/** Dashboard shell — sidebar CRM, full-width workspace, no landing header. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OpportunityDrawerProvider>
      <div className="bee-crm flex h-screen overflow-hidden bg-[var(--color-background)]">
        <DashboardSidebar />
        <main className="bee-crm-main min-w-0 flex-1 overflow-y-auto">
          <div className="bee-crm-content">{children}</div>
        </main>
        <OpportunityDrawer />
      </div>
    </OpportunityDrawerProvider>
  );
}
