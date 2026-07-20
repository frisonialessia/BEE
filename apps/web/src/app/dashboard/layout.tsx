"use client";

import { DashboardRail } from "@/components/dashboard/dashboard-rail";
import { OpportunityDrawer } from "@/features/crm/opportunity-drawer";
import { OpportunityDrawerProvider } from "@/features/crm/opportunity-drawer-context";

/** Shell CRM — rail 52px + workspace + drawer lateral. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OpportunityDrawerProvider>
      <div className="bee-app">
        <DashboardRail />
        <div className="bee-main">
          <div className="bee-scroll">{children}</div>
        </div>
        <OpportunityDrawer />
      </div>
    </OpportunityDrawerProvider>
  );
}
