"use client";

import { useTranslations } from "next-intl";

import { CrmBoard } from "@/features/crm/crm-board";

/** CRM — el pipeline real de BEE, separado de Oportunidades (que ahora es
 *  solo battlecards + flujo agregado). Esta es la vista que un director
 *  espera ver primero: cuentas moviéndose de etapa en etapa, arrastrables.
 *
 *  bee-page-fill: el board usa el estándar de "llenar el alto disponible,
 *  scroll interno" (ver su definición en globals.css) en vez del
 *  max-h-[65vh] que tenía antes — ese valor medía contra el viewport
 *  completo del navegador, no contra lo que .bee-scroll realmente tiene
 *  visible, así que subestimaba cuánto espacio real había para mostrar
 *  leads. */
export function CrmView() {
  const t = useTranslations("crm.view");

  return (
    <div className="bee-page-fill">
      <header className="mb-6 shrink-0">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("description")}</p>
        </div>
      </header>

      <div className="bee-panel-fill">
        <CrmBoard />
      </div>
    </div>
  );
}
