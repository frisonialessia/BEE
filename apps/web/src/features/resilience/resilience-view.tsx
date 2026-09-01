"use client";

import { useTranslations } from "next-intl";

import { PendingActionsPanel } from "@/components/pending-actions";
import { ResiliencePanel } from "@/components/resilience-panel";

/** Resiliencia — auditoría de decisiones de agentes, dead-letter queue, anomalías y cola de ejecución. */
export function ResilienceView() {
  const t = useTranslations("probarForecastOps.resilience");
  const tNav = useTranslations("nav.items");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{tNav("resilience")}</h1>
          <p className="bee-caption mt-1">{t("subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <PendingActionsPanel />
        <ResiliencePanel />
      </div>
    </div>
  );
}
