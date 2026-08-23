"use client";

import { DarkFunnelDashboard } from "@/components/dark-funnel-dashboard";

/** Pipeline oculto — señales de intención de compra invisibles al tracking estándar. */
export function DarkFunnelView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Motor de señales de intención</p>
        <div className="mt-1">
          <h1 className="bee-display">Pipeline oculto</h1>
          <p className="bee-caption mt-1">
            Investigación anónima de alta intensidad — leads que investigan antes de convertir
          </p>
        </div>
      </header>

      <DarkFunnelDashboard />
    </div>
  );
}
