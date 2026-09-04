"use client";

import { Sigma } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { OpportunityCard } from "@/components/opportunity-card";
import { MarketInsightsList } from "@/components/strategy/market-insights-list";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { SuccessPatternsList } from "@/components/strategy/success-patterns-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useMarketInsights } from "@/hooks/queries/use-market-insights";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useDashboardBase } from "@/lib/demo/mode";
import { closedDealSample, computeStrategyEvidence, type StrategyEvidence } from "@/lib/strategy-evidence";
import { LiveBadge } from "@/components/live-badge";

/** What a card shows while its evidence map is still being built — never a
 *  made-up figure, just the honest "no history" state. */
const NO_EVIDENCE: StrategyEvidence = { basis: "none", sampleSize: 0, won: 0, winRate: null, daysToClose: null, industry: null };

/** Estrategias y battlecards — plays listos para el CEO. */
export function StrategiesDashboard() {
  const t = useTranslations("signalsStrategies.strategies");
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 200);
  const { data: patternsResult, isLoading: loadingPatterns } = useSuccessPatterns();
  const { data: insightsResult, isLoading: loadingInsights } = useMarketInsights();
  // Evidence inputs: every signal (to map a closed deal back to its signal
  // type) and every company (for the industry cohort). Both already cached
  // by other pages; here they only feed computeStrategyEvidence.
  const { data: signalsResult } = useSignals(500);
  const { data: companiesResult } = useCompanies(300);
  const { openOpportunity } = useOpportunityDrawer();
  const base = useDashboardBase();

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const patterns = patternsResult?.data ?? [];
  const insights = insightsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const battlecardPagination = usePagination(battlecards);
  const pipelinePagination = usePagination(opportunities);

  const sample = useMemo(() => closedDealSample(allOppsResult?.data ?? []), [allOppsResult]);
  const evidenceById = useMemo(() => {
    const ctx = {
      opportunities: allOppsResult?.data ?? [],
      signals: signalsResult?.data ?? [],
      companies: companiesResult?.data ?? [],
      patterns: patternsResult?.data ?? [],
    };
    return new Map(
      (battlecardsResult?.data ?? []).map((card) => [card.opportunity_id, computeStrategyEvidence(card, ctx)]),
    );
  }, [battlecardsResult, allOppsResult, signalsResult, companiesResult, patternsResult]);

  function calendarHrefFor(opportunityId: string, company: string | null): string {
    const params = new URLSearchParams({ new: "1", opportunity: opportunityId });
    if (company) params.set("title", company);
    return `${base}/calendar?${params.toString()}`;
  }

  return (
    <div>
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">
              {t("subtitle")}
            </p>
          </div>
          <LiveBadge live={live} />
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

          <TabsContent value="battlecards" className="mt-4 space-y-4">
            {battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("battlecardsEmptyTitle")}
                </p>
                <p className="bee-caption mt-1">{t("battlecardsEmptySubtitle")}</p>
              </div>
            ) : (
              <>
                <p className="flex items-center gap-2 bee-caption">
                  <Sigma className="size-3.5 shrink-0" aria-hidden />
                  {sample.closed > 0
                    ? t("sampleLine", { closed: sample.closed, won: sample.won })
                    : t("sampleLineEmpty")}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [grid-auto-rows:1fr]">
                  {battlecardPagination.pageItems.map((card) => (
                    <StrategyCard
                      key={card.opportunity_id}
                      card={card}
                      evidence={evidenceById.get(card.opportunity_id) ?? NO_EVIDENCE}
                      calendarHref={calendarHrefFor(card.opportunity_id, card.company.name)}
                      onOpen={(id) => openOpportunity(id, { tab: "strategy" })}
                    />
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

          <TabsContent value="pipeline" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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

          <TabsContent value="learning" className="mt-4 space-y-4">
            <p className="bee-caption">
              {t("learningCaption")}
            </p>
            {loadingPatterns ? (
              <Skeleton className="h-40" />
            ) : (
              <SuccessPatternsList patterns={patterns} />
            )}
          </TabsContent>

          <TabsContent value="marketInsights" className="mt-4 space-y-4">
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
