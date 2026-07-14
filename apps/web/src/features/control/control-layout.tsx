"use client";

import type { ReactNode } from "react";

interface ControlLayoutProps {
  header: ReactNode;
  /** Left — primary action zone (Kanban) */
  workspace: ReactNode;
  /** Right top — system metrics */
  health: ReactNode;
  /** Right — intelligence (hex map + signal stream) */
  intelligence: ReactNode;
}

/**
 * CRM proximity layout:
 *  Left  → LeadWorkspace (action)
 *  Right → SystemHealth + SignalHexMap + SignalStream (intelligence)
 */
export function ControlLayout({
  header,
  workspace,
  health,
  intelligence,
}: ControlLayoutProps) {
  return (
    <div className="bee-crm-control">
      <header className="bee-crm-control__header">{header}</header>
      <div className="bee-crm-control__body">
        <div className="bee-crm-control__action">{workspace}</div>
        <div className="bee-crm-control__intel">
          <div className="bee-crm-control__metrics">{health}</div>
          <div className="bee-crm-control__viz">{intelligence}</div>
        </div>
      </div>
    </div>
  );
}
