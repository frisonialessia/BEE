"use client";

import { useTranslations } from "next-intl";

import { MergedPageTabs } from "@/components/merged-page-tabs";
import { CrmBoard } from "@/features/crm/crm-board";
import { OpportunitiesList } from "@/features/opportunities/opportunities-dashboard";

/** CRM — four views of the same pipeline in one tab strip: Pipeline (the
 *  drag-and-drop board), Oportunidades (the searchable list), Battlecards
 *  (the AI plays) and Flujo (stage-to-stage aggregate). Battlecards and
 *  Flujo used to sit as sub-tabs inside Oportunidades — two clicks and a
 *  nested strip for views people open constantly; now every view is one
 *  click from the top. /dashboard/opportunities still redirects to
 *  ?tab=opportunities, so no old link breaks.
 *
 *  Página normal, mismo scroll que Resumen — el board crece con su
 *  contenido y es la página completa la que hace scroll. */
export function CrmView() {
  const t = useTranslations("crm.view");

  return (
    <div>
      <MergedPageTabs
        header={
          <header>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("description")}</p>
          </header>
        }
        defaultValue="pipeline"
        tabs={[
          { value: "pipeline", label: t("pipelineTab"), content: <CrmBoard /> },
          { value: "opportunities", label: t("opportunitiesTab"), content: <OpportunitiesList /> },
        ]}
      />
    </div>
  );
}
