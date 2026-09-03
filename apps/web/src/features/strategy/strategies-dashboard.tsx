"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";

import { BattlecardView } from "@/components/battlecard";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { OpportunityCard } from "@/components/opportunity-card";
import { MarketInsightsList } from "@/components/strategy/market-insights-list";
import { SuccessPatternsList } from "@/components/strategy/success-patterns-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { usePagination } from "@/hooks/use-pagination";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useMarketInsights } from "@/hooks/queries/use-market-insights";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";

/** Estrategias y battlecards — plays listos para el CEO. */
export function StrategiesDashboard() {
  const t = useTranslations("signalsStrategies.strategies");
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { data: patternsResult, isLoading: loadingPatterns } = useSuccessPatterns();
  const { data: insightsResult, isLoading: loadingInsights } = useMarketInsights();
  const { openOpportunity } = useOpportunityDrawer();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const patterns = patternsResult?.data ?? [];
  const insights = insightsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);
  const pipelinePagination = usePagination(opportunities);

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">
              {t("subtitle")}
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>
            {live ? t("live") : t("demo")}
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
          {/* Four triggers don't fit a phone-width row — let the list wrap
              instead of overflowing the page horizontally (h-9 is pinned by
              the variant, so the same variant selector releases it). */}
          <TabsList className="h-auto max-w-full flex-wrap border border-border bg-background group-data-[orientation=horizontal]/tabs:h-auto">
            <TabsTrigger value="battlecards" className="rounded-sm">
              {t("tabBattlecards", { count: battlecards.length })}
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-sm">
              {t("tabPipeline", { count: opportunities.length })}
            </TabsTrigger>
            <TabsTrigger value="learning" className="rounded-sm">
              {t("tabLearning", { count: patterns.length })}
            </TabsTrigger>
            <TabsTrigger value="marketInsights" className="rounded-sm">
              {t("tabMarketInsights", { count: insights.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battlecards" className="mt-6 space-y-4">
            {battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("battlecardsEmptyTitle")}
                </p>
                <p className="bee-caption mt-1">{t("battlecardsEmptySubtitle")}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  {t("battlecardsHint")}
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                  itemLabel={t("battlecardsItemLabel")}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
              itemLabel={t("pipelineItemLabel")}
            />
          </TabsContent>

          <TabsContent value="learning" className="mt-6 space-y-4">
            <p className="bee-caption">
              {t("learningCaption")}
            </p>
            {loadingPatterns ? (
              <Skeleton className="h-40" />
            ) : (
              <SuccessPatternsList patterns={patterns} />
            )}
          </TabsContent>

          <TabsContent value="marketInsights" className="mt-6 space-y-4">
            <p className="bee-caption">{t("marketInsightsCaption")}</p>
            {loadingInsights ? (
              <Skeleton className="h-40" />
            ) : (
              <MarketInsightsList insights={insights} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
