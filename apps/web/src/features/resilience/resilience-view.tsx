"use client";

import { useTranslations } from "next-intl";

import { PendingActionsPanel } from "@/components/pending-actions";
import { ResiliencePanel } from "@/components/resilience-panel";

/** Resiliencia — auditoría de decisiones de agentes, dead-letter queue,
 * anomalías y cola de ejecución.
 *
 * `showHeader=false` when embedded as a tab of the merged Control page
 * (see control-page.tsx / probar/control/page.tsx). */
export function ResilienceView({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("probarForecastOps.resilience");
  const tNav = useTranslations("nav.items");

  return (
    <div>
      {showHeader && (
        <header className="mb-4">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <div className="mt-1">
            <h1 className="bee-display">{tNav("resilience")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
        </header>
      )}

      {/* grid-cols-1 explícito: sin columna base, esta grilla usaba un track
       * implícito "auto" en vez de minmax(0,1fr) — no se achicaba para caber
       * en el viewport, así que el panel de Resiliencia (con la fila de 5
       * tarjetas) se desbordaba por la derecha en móvil sin scroll visible. */}
      <div className="bee-overview">
        <PendingActionsPanel />
        <ResiliencePanel />
      </div>
    </div>
  );
}
