"use client";

import { Bot } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { PipelineBoard } from "@/features/opportunities/pipeline-board";
import { PipelineFlow } from "@/features/opportunities/pipeline-flow";
import { usePagination } from "@/hooks/use-pagination";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";

/** Oportunidades y battlecards — plays listos para el CEO. */
export function OpportunitiesDashboard() {
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { openOpportunity } = useOpportunityDrawer();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Pipeline comercial</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Oportunidades</h1>
            <p className="bee-caption mt-1">
              Oportunidades enriquecidas con pain point, argumento de cierre y ventana de timing
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? "En vivo" : "Datos demo"}
          </Badge>
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
              Battlecards ({battlecards.length})
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-sm">
              Pipeline ({opportunities.length})
            </TabsTrigger>
            <TabsTrigger value="flujo" className="rounded-sm">
              Flujo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battlecards" className="mt-6 space-y-4">
            {battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Aún no hay battlecards listas para acción.
                </p>
                <p className="bee-caption mt-1">Las señales deben enriquecerse primero.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  Clic en una tarjeta para abrir el drawer de oportunidad
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {battlecardPagination.pageItems.map((card, i) => (
                    <button
                      key={card.opportunity_id}
                      type="button"
                      onClick={() => openOpportunity(card.opportunity_id)}
                      className={`bee-bento bee-bento-pad-lg text-left hover:border-[var(--color-chart-4)] ${
                        i % 2 === 0 ? "bee-bento--primary" : ""
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

          <TabsContent value="pipeline" className="mt-6">
            {opportunities.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-12 text-center">
                <p className="text-sm text-muted-foreground">Aún no hay oportunidades en el pipeline.</p>
              </div>
            ) : (
              <PipelineBoard opportunities={opportunities} onOpen={openOpportunity} />
            )}
          </TabsContent>

          <TabsContent value="flujo" className="mt-6">
            <PipelineFlow opportunities={opportunities} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
