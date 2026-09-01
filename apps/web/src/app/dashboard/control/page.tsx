"use client";

import {
  AnomaliesPanel,
  ApiStatusPanel,
  ControlLayout,
  LeadWorkspace,
  SignalHexMap,
  SignalStream,
  SystemHealth,
} from "@/features/control";

/** BEE Control — workspace operativo CRM. */
export default function ControlPage() {
  return (
    <ControlLayout
      header={
        <>
          <p className="bee-eyebrow">Operaciones</p>
          <h1 className="bee-display mt-1">Control</h1>
          <p className="bee-caption mt-1">
            Kanban de acción · inteligencia hexagonal · métricas del sistema
          </p>
        </>
      }
      action={<LeadWorkspace />}
      hive={<SignalHexMap height={240} maxLeads={200} className="h-full" />}
      intelligence={<SystemHealth />}
      stream={<SignalStream />}
      apiStatus={<ApiStatusPanel />}
      anomalies={<AnomaliesPanel />}
    />
  );
}
