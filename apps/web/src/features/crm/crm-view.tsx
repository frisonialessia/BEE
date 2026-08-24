"use client";

import { CrmBoard } from "@/features/crm/crm-board";

/** CRM — el pipeline real de BEE, separado de Oportunidades (que ahora es
 *  solo battlecards + flujo agregado). Esta es la vista que un director
 *  espera ver primero: cuentas moviéndose de etapa en etapa, arrastrables. */
export function CrmView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Pipeline comercial</p>
        <div className="mt-1">
          <h1 className="bee-display">CRM</h1>
          <p className="bee-caption mt-1">
            El pipeline real, etapa por etapa — arrastra una tarjeta para moverla
          </p>
        </div>
      </header>

      <CrmBoard />
    </div>
  );
}
