"use client";

import type { ReactNode } from "react";

import { SystemStatStrip } from "./components/SystemStatStrip";

interface ControlLayoutProps {
  header: ReactNode;
  /** Pipeline de leads — stage counts + jump to CRM (LeadWorkspace). */
  action: ReactNode;
  /** Colmena de intención (SignalHexMap) — carries its own card shell. */
  hive: ReactNode;
  /** Salud del sistema (SystemHealth). */
  intelligence: ReactNode;
  /** Actividad reciente (SignalStream). */
  stream: ReactNode;
  /** Fuentes de datos (ApiStatusPanel). */
  apiStatus: ReactNode;
  /** Anomalías de conversión (AnomaliesPanel). */
  anomalies: ReactNode;
}

/**
 * Sistema tab — answers "is BEE healthy right now?" the same way every
 * other page in the app answers its question: a 4-tile strip of headline
 * numbers, then the 12-column .bee-overview grid (equal-height rows, one
 * card shell per box). Row 1 is where signals come from and what just
 * happened to them; row 2 is the machine's own health, the lead pipeline
 * and anything abnormal; row 3 is the hive (its own shell, spans the row).
 * Each box caps its list height and scrolls inside, so a long feed never
 * stretches its row siblings into half-empty boxes.
 */
export function ControlLayout({
  header,
  action,
  hive,
  intelligence,
  stream,
  apiStatus,
  anomalies,
}: ControlLayoutProps) {
  return (
    <div className="space-y-4">
      {header}
      <SystemStatStrip />
      <div className="bee-overview">
        {apiStatus}
        {stream}
        {intelligence}
        {action}
        {anomalies}
        <div style={{ gridColumn: "span 12" }} className="min-h-0">
          {hive}
        </div>
      </div>
    </div>
  );
}
