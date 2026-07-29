"use client";

import { PendingActionsPanel } from "@/components/pending-actions";
import { ResiliencePanel } from "@/components/resilience-panel";

/** Resiliencia — auditoría de decisiones de agentes, dead-letter queue, anomalías y cola de ejecución. */
export function ResilienceView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Audit Trail · Dead Letter · Anomaly Detector</p>
        <div className="mt-1">
          <h1 className="bee-display">Resiliencia</h1>
          <p className="bee-caption mt-1">
            Observabilidad del sistema — decisiones de agentes, reintentos fallidos y alertas de estrategia
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <PendingActionsPanel />
        <ResiliencePanel />
      </div>
    </div>
  );
}
