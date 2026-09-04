"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { SystemStatStrip } from "./components/SystemStatStrip";

interface ControlLayoutProps {
  header: ReactNode;
  /** Motor de señales — hourly ingest curve + connection/db/engine rows (SystemHealth). */
  engine: ReactNode;
  /** Cola de eventos fallidos — the DLQ (FailedEventsPanel). Wrapped to span 4. */
  dlq: ReactNode;
  /** Registro de decisiones — the agent audit trail (AuditLogPanel). Wrapped to span 4. */
  audit: ReactNode;
  /** Heading of the Resiliencia section (eyebrow + one-line subtitle). */
  resilienceHeader: ReactNode;
  /** Cola de ejecución — actions waiting for a person's OK (PendingActionsPanel). */
  pending: ReactNode;
  /** Anomalías de conversión (AnomaliesPanel). */
  anomalies: ReactNode;
  /** Fuentes de datos (ApiStatusPanel). */
  apiStatus: ReactNode;
  /** Actividad reciente (SignalStream). */
  stream: ReactNode;
  /** Pipeline de leads — stage counts + jump to CRM (LeadWorkspace). */
  action: ReactNode;
}

/**
 * Control — ONE health board instead of two tabs (Sistema, Resiliencia) that
 * repeated the queue depth and error counts in both strips. Same shell as
 * every other page: a 5-tile strip of headline numbers, then the 12-column
 * .bee-overview grid. Row 1 is the machine: signals per hour and the engine's
 * state, what failed on the way out (DLQ), and what the agents decided
 * (audit). Then the Resiliencia section — what needs a person: actions
 * waiting for an OK and conversion anomalies. Row 3 is where signals come
 * from, what just happened to them, and where the leads stand. The hive
 * moved to Señales › Intención (it is intent data, same source as the Dark
 * Funnel), so Control no longer repeats it.
 *
 * `/dashboard/resilience` and `?tab=resilience` still land here: the old
 * tab param scrolls to the Resiliencia section instead of switching a tab.
 */
export function ControlLayout({
  header,
  engine,
  dlq,
  audit,
  resilienceHeader,
  pending,
  anomalies,
  apiStatus,
  stream,
  action,
}: ControlLayoutProps) {
  const searchParams = useSearchParams();
  const resilienceRef = useRef<HTMLElement>(null);
  const wantsResilience = searchParams.get("tab") === "resilience";

  useEffect(() => {
    if (wantsResilience) resilienceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wantsResilience]);

  return (
    <div className="space-y-4">
      {header}
      <SystemStatStrip />
      <div className="bee-overview">
        {engine}
        <div style={{ gridColumn: "span 4" }} className="min-h-0">
          {dlq}
        </div>
        <div style={{ gridColumn: "span 4" }} className="min-h-0">
          {audit}
        </div>
      </div>

      <section ref={resilienceRef} id="resilience" className="scroll-mt-4 space-y-4">
        {resilienceHeader}
        <div className="bee-overview">
          {pending}
          <div style={{ gridColumn: "span 6" }} className="min-h-0">
            {anomalies}
          </div>
        </div>
      </section>

      <div className="bee-overview">
        {apiStatus}
        {stream}
        {action}
      </div>
    </div>
  );
}
