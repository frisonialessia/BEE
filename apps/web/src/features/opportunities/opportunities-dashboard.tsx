"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { PipelineFlow } from "@/features/opportunities/pipeline-flow";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import { stripOpportunityTitlePrefix } from "@/lib/format";
import { LiveBadge } from "@/components/live-badge";

/** Oportunidades y battlecards — plays listos para el CEO.
 *
 * `showHeader=false` when embedded as a tab of the merged CRM page (see
 * crm-view.tsx) — the page-level header already carries the eyebrow/title,
 * a second one directly under it would be redundant. The live/demo badge
 * and CSV export button stay either way; those are real actions, not
 * decoration a page-level header already covers. */
export function OpportunitiesDashboard({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("opportunitiesPriority.opportunities");
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { data: companiesResult } = useCompanies(200);
  const { data: users } = useUsers();
  const { openOpportunity } = useOpportunityDrawer();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);

  const companyById = new Map((companiesResult?.data ?? []).map((c) => [c.id, c]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const exportRows = opportunities.map((o) => ({
    titulo: stripOpportunityTitlePrefix(o.title),
    estado: t(`status.${o.status}`),
    puntaje: Math.round(o.score),
    empresa: o.company_id ? (companyById.get(o.company_id)?.name ?? "") : "",
    responsable: o.assigned_to_user_id ? (userById.get(o.assigned_to_user_id)?.full_name ?? "") : "",
  }));

  return (
    <div>
      <header className={showHeader ? "mb-4" : "mb-4"}>
        {showHeader && <p className="bee-eyebrow">{t("eyebrow")}</p>}
        <div className={`flex flex-wrap items-start justify-between gap-3 ${showHeader ? "mt-1" : ""}`}>
          {showHeader && (
            <div>
              <h1 className="bee-display">{t("title")}</h1>
              <p className="bee-caption mt-1">{t("subtitle")}</p>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {showHeader && <LiveBadge live={live} />}
            <ExportCsvButton
              rows={exportRows}
              filename={t("exportFilename")}
              columns={[
                { key: "titulo", header: t("csv.title") },
                { key: "estado", header: t("csv.status") },
                { key: "puntaje", header: t("csv.score") },
                { key: "empresa", header: t("csv.company") },
                { key: "responsable", header: t("csv.owner") },
              ]}
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Tabs defaultValue="battlecards">
          <TabsList className="border border-border bg-background">
            <TabsTrigger value="battlecards" className="rounded-sm">
              {t("tabs.battlecards", { count: battlecards.length })}
            </TabsTrigger>
            <TabsTrigger value="flujo" className="rounded-sm">
              {t("tabs.flow")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battlecards" className="mt-4 space-y-4">
            {battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("emptyBattlecards.title")}</p>
                <p className="bee-caption mt-1">{t("emptyBattlecards.subtitle")}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  {t("battlecardsHint")}
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {battlecardPagination.pageItems.map((card) => (
                    <button
                      key={card.opportunity_id}
                      type="button"
                      onClick={() => openOpportunity(card.opportunity_id)}
                      className={`bee-bento bee-bento-pad text-left hover:border-[var(--color-chart-4)] ${
                        ""
                      }`}
                    >
                      <BattlecardView card={card} />
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={battlecardPagination.page}
                  pageSize={battlecardPagination.pageSize}
                  totalPages={battlecardPagination.totalPages}
                  totalItems={battlecardPagination.totalItems}
                  onPageChange={battlecardPagination.goToPage}
                  onPageSizeChange={battlecardPagination.changePageSize}
                  itemLabel="battlecards"
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="flujo" className="mt-4">
            <PipelineFlow opportunities={opportunities} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
