"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { PendingActionsPanel } from "@/components/pending-actions";
import { AuditLogPanel, FailedEventsPanel } from "@/components/resilience-panel";

import { AnomaliesPanel } from "./components/AnomaliesPanel";
import { ApiStatusPanel } from "./components/ApiStatusPanel";
import { SystemHealth } from "./components/SystemHealth";

/**
 * Salud — ONE board in the 12-column .bee-overview grid, read top to
 * bottom: the machine (signals per hour and the engine's state beside
 * where the signals come from), then what needs a person (actions waiting
 * for an OK, conversion anomalies), then what went wrong on the way out
 * and what the agents decided. The four headline numbers live on the tab
 * strip above (SystemStatStrip, via MergedPageTabs' belowTabs). The
 * activity stream and the lead pipeline used to be boxes here too; they
 * repeat Señales and the CRM, so they are gone.
 *
 * `/dashboard/resilience` and `?tab=resilience` still land here: the old
 * tab param scrolls to the execution queue instead of switching a tab.
 */
export function ControlLayout() {
  const searchParams = useSearchParams();
  const resilienceRef = useRef<HTMLDivElement>(null);
  const wantsResilience = searchParams.get("tab") === "resilience";

  useEffect(() => {
    if (wantsResilience) resilienceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wantsResilience]);

  return (
    <div className="bee-overview">
      <SystemHealth />
      <ApiStatusPanel />
      <div ref={resilienceRef} id="resilience" style={{ gridColumn: "span 6" }} className="min-h-0 scroll-mt-4">
        <PendingActionsPanel />
      </div>
      <AnomaliesPanel />
      <FailedEventsPanel />
      <AuditLogPanel />
    </div>
  );
}
