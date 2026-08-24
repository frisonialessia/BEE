"use client";

import { Bot } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { OpportunityCard } from "@/components/opportunity-card";
import { SuccessPatternsList } from "@/components/strategy/success-patterns-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { usePagination } from "@/hooks/use-pagination";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";

/** Estrategias y battlecards — plays listos para el CEO. */
export function StrategiesDashboard() {
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { data: patternsResult, isLoading: loadingPatterns } = useSuccessPatterns();
  const { openOpportunity } = useOpportunityDrawer();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const patterns = patternsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);
  const pipelinePagination = usePagination(opportunities);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Playbooks</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Estrategias</h1>
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
            <TabsTrigger value="learning" className="rounded-sm">
              Aprendizaje ({patterns.length})
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

          <TabsContent value="pipeline" className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pipelinePagination.pageItems.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => openOpportunity(opp.id)}
                  className="text-left"
                >
                  <OpportunityCard opportunity={opp} />
                </button>
              ))}
            </div>
            <PaginationBar
              page={pipelinePagination.page}
              pageSize={pipelinePagination.pageSize}
              totalPages={pipelinePagination.totalPages}
              totalItems={pipelinePagination.totalItems}
              onPageChange={pipelinePagination.goToPage}
              onPageSizeChange={pipelinePagination.changePageSize}
              itemLabel="oportunidades"
            />
          </TabsContent>

          <TabsContent value="learning" className="mt-6 space-y-4">
            <p className="bee-caption">
              Patrones de éxito reales, aprendidos de deals ya cerrados — lo que hoy sesga
              la generación de battlecards nuevas.
            </p>
            {loadingPatterns ? (
              <Skeleton className="h-40" />
            ) : (
              <SuccessPatternsList patterns={patterns} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
