"use client";

import type { ReactNode } from "react";

interface ControlLayoutProps {
  header: ReactNode;
  health: ReactNode;
  hero: ReactNode;
  stream: ReactNode;
  workspace: ReactNode;
}

/**
 * ControlLayout — CSS Grid shell for the BEE operator dashboard.
 *
 * Hierarchy (top → bottom):
 *  1. Page header
 *  2. SystemHealth (full width)
 *  3. SignalHexMap hero (full width)
 *  4. SignalStream 30% + LeadWorkspace 70%
 *
 * Fixed min-heights prevent layout shift during TanStack Query refreshes.
 */
export function ControlLayout({
  header,
  health,
  hero,
  stream,
  workspace,
}: ControlLayoutProps) {
  return (
    <div className="bee-control-grid">
      <header className="bee-control-grid__header">{header}</header>
      <div className="bee-control-grid__health">{health}</div>
      <div className="bee-control-grid__hero">{hero}</div>
      <div className="bee-control-grid__footer">
        <div className="bee-control-grid__stream">{stream}</div>
        <div className="bee-control-grid__workspace">{workspace}</div>
      </div>
    </div>
  );
}
