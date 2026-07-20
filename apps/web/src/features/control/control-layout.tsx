"use client";

import type { ReactNode } from "react";

interface ControlLayoutProps {
  header: ReactNode;
  /** Columna A — Kanban / acción */
  workspace: ReactNode;
  /** Columna B — HexMap + stream */
  intelligence: ReactNode;
  /** Columna C — métricas / salud */
  health: ReactNode;
}

/** Layout Control — 3 columnas: Acción | Inteligencia | Métricas. */
export function ControlLayout({
  header,
  workspace,
  intelligence,
  health,
}: ControlLayoutProps) {
  return (
    <div className="bee-crm-control">
      <header className="bee-crm-control__header">{header}</header>
      <div className="bee-crm-control__body">
        <div className="bee-crm-control__action">{workspace}</div>
        <div className="bee-crm-control__viz">{intelligence}</div>
        <div className="bee-crm-control__metrics">{health}</div>
      </div>
    </div>
  );
}
