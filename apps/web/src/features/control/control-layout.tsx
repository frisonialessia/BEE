"use client";

import type { ReactNode } from "react";

interface ControlLayoutProps {
  header: ReactNode;
  /** Top row, left — Zona de acción (Espacio de leads). */
  action: ReactNode;
  /** Top row, center — Colmena de intención (SignalHexMap). */
  hive: ReactNode;
  /** Top row, right — Inteligencia (SystemHealth, connectivity + worker KPIs). */
  intelligence: ReactNode;
  /** Bottom row, left — Flujo de señales (SignalStream). */
  stream: ReactNode;
  /** Bottom row, center — APIs externas (ApiStatusPanel). */
  apiStatus: ReactNode;
  /** Bottom row, right — Anomalías (AnomaliesPanel). */
  anomalies: ReactNode;
}

/**
 * Layout Control — a real 2×3 bento grid, not 3 unevenly-stacked columns.
 *
 * The previous layout (one row, three columns, several components stacked
 * per column) put widgets with very different natural content lengths
 * (a 5-row stage count next to a scrolling event feed) in direct
 * height competition — whichever had the least content read as broken
 * (a card with a large dead area) or the most content read as cramped
 * (clipped inside an undersized box), no matter how the CSS was tuned.
 *
 * Splitting into two rows groups widgets by actual weight instead: the top
 * row (Zona de acción, Colmena de intención, Inteligencia) are all
 * naturally compact — a stage count, a fixed-height hex grid, a KPI strip
 * — so stretching them to match each other looks intentional, not empty.
 * The bottom row (Flujo de señales, APIs externas, Anomalías) are the three
 * genuinely scrollable, content-length-varying widgets; grouped together
 * they can stretch to match *each other* instead of a much shorter
 * sibling, and each scrolls independently within its own equal-height
 * card when its own content runs long.
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
    <div className="bee-crm-control">
      <header className="bee-crm-control__header">{header}</header>
      <div className="bee-crm-control__row bee-crm-control__row--top">
        <div className="bee-crm-control__cell">{action}</div>
        <div className="bee-crm-control__cell">{hive}</div>
        <div className="bee-crm-control__cell">{intelligence}</div>
      </div>
      <div className="bee-crm-control__row bee-crm-control__row--bottom">
        <div className="bee-crm-control__cell">{stream}</div>
        <div className="bee-crm-control__cell">{apiStatus}</div>
        <div className="bee-crm-control__cell">{anomalies}</div>
      </div>
    </div>
  );
}
