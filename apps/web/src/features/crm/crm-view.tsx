"use client";

import { useTranslations } from "next-intl";

import { MergedPageTabs } from "@/components/merged-page-tabs";
import { CrmBoard } from "@/features/crm/crm-board";
import { OpportunitiesDashboard } from "@/features/opportunities/opportunities-dashboard";

/** CRM — el pipeline real de BEE, arrastrable etapa por etapa, con
 *  Oportunidades (battlecards + flujo agregado) como una segunda pestaña
 *  — dos vistas del mismo pipeline, no dos conceptos distintos, así que
 *  antes eran dos filas del sidebar y ahora son una sola con pestañas
 *  (ver lib/nav-items.ts). /dashboard/opportunities sigue existiendo como
 *  redirect a ?tab=opportunities, ningún link/bookmark viejo se rompe.
 *
 *  Página normal, mismo scroll que Resumen — antes usaba bee-page-fill
 *  (alto fijo al viewport, scroll interno solo dentro de cada columna),
 *  que hacía incómodo bajar a ver las tarjetas de más abajo en una
 *  columna larga. Ahora el board simplemente crece con su contenido y es
 *  la página completa la que hace scroll, como cualquier otra sección. */
export function CrmView() {
  const t = useTranslations("crm.view");

  return (
    <div>
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">{t("description")}</p>
        </div>
      </header>

      <MergedPageTabs
        defaultValue="pipeline"
        tabs={[
          { value: "pipeline", label: t("pipelineTab"), content: <CrmBoard /> },
          {
            value: "opportunities",
            label: t("opportunitiesTab"),
            content: <OpportunitiesDashboard showHeader={false} />,
          },
        ]}
      />
    </div>
  );
}
