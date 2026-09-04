"use client";

import { useTranslations } from "next-intl";

import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { CrmBoard } from "@/features/crm/crm-board";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
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
  const tBoard = useTranslations("crm.board");
  const { openNew } = useOpportunityDrawer();
  // Same query the board runs — one cache entry, so the badge and the
  // board always agree on whether the data is live.
  const { data: oppsResult } = useOpportunities(undefined, 300);

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
        actions={<LiveBadge live={oppsResult?.live ?? false} />}
        actionsByTab={{
          // Opens the same side panel as a card, empty — never a centered dialog.
          pipeline: (
            <button type="button" onClick={() => openNew()} className="bee-btn bee-btn--primary text-xs">
              {tBoard("newOpportunity")}
            </button>
          ),
        }}
        tabs={[
          { value: "pipeline", label: t("pipelineTab"), content: <CrmBoard /> },
          { value: "opportunities", label: t("opportunitiesTab"), content: <OpportunitiesList /> },
        ]}
      />
    </div>
  );
}
