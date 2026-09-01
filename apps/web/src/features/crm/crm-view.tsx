"use client";

import { useTranslations } from "next-intl";

import { CrmBoard } from "@/features/crm/crm-board";

/** CRM — el pipeline real de BEE, separado de Oportunidades (que ahora es
 *  solo battlecards + flujo agregado). Esta es la vista que un director
 *  espera ver primero: cuentas moviéndose de etapa en etapa, arrastrables. */
export function CrmView() {
  const t = useTranslations("crm.view");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("description")}</p>
        </div>
      </header>

      <CrmBoard />
    </div>
  );
}
