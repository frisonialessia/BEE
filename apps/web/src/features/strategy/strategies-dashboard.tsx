"use client";

import { Sigma } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { pairPatternsWithInsights, WhatWorksList } from "@/components/strategy/what-works-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useMarketInsights } from "@/hooks/queries/use-market-insights";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";
import { getOpportunityStatusLabels } from "@/lib/format";
import { closedDealSample, computeStrategyEvidence, type StrategyEvidence } from "@/lib/strategy-evidence";
import type { OpportunityStatus } from "@/types/domain";

/** What a card shows while its evidence map is still being built — never a
 *  made-up figure, just the honest "no history" state. */
const NO_EVIDENCE: StrategyEvidence = { basis: "none", sampleSize: 0, won: 0, winRate: null, daysToClose: null, industry: null };

/** The open stages a battlecard can be in, in pipeline order — the segments
 *  of the stage filter. Closed ones never have a battlecard ready to act. */
const STAGES: OpportunityStatus[] = ["detected", "ready_to_action", "prioritized", "in_progress"];

/** Estrategias — the battlecards, one list, filtered by pipeline stage, and
 *  "Qué funciona": what closed and the market signal behind it.
 *
 *  Four tabs became two: the old Pipeline tab showed the same opportunities
 *  as Battlecards with a plainer card, so it is now a stage segment on the
 *  single list; Aprendizaje (success patterns) and Mercado (market insights)
 *  were the two halves of one answer — "what works, and why" — and are one
 *  card per pattern now (see what-works-list.tsx). */
export function StrategiesDashboard() {
  const locale = useLocale() as Locale;
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
  const [stage, setStage] = useState<OpportunityStatus | "">("");

  const battlecards = useMemo(() => battlecardsResult?.data ?? [], [battlecardsResult]);
  const patterns = useMemo(() => patternsResult?.data ?? [], [patternsResult]);
  const insights = useMemo(() => insightsResult?.data ?? [], [insightsResult]);
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  const countByStage = useMemo(() => {
    const counts = new Map<OpportunityStatus, number>();
    for (const card of battlecards) counts.set(card.status, (counts.get(card.status) ?? 0) + 1);
    return counts;
  }, [battlecards]);
  const filtered = useMemo(() => (stage ? battlecards.filter((c) => c.status === stage) : battlecards), [battlecards, stage]);
  const pagination = usePagination(filtered);
  const stageLabels = getOpportunityStatusLabels(locale);

  const sample = useMemo(() => closedDealSample(allOppsResult?.data ?? []), [allOppsResult]);
  const evidenceById = useMemo(() => {
    const ctx = {
      opportunities: allOppsResult?.data ?? [],
      signals: signalsResult?.data ?? [],
      companies: companiesResult?.data ?? [],
      patterns,
    };
    return new Map(battlecards.map((card) => [card.opportunity_id, computeStrategyEvidence(card, ctx)]));
  }, [battlecards, allOppsResult, signalsResult, companiesResult, patterns]);

  const works = useMemo(() => pairPatternsWithInsights(patterns, insights), [patterns, insights]);

  function calendarHrefFor(opportunityId: string, company: string | null): string {
    const params = new URLSearchParams({ new: "1", opportunity: opportunityId });
    if (company) params.set("title", company);
    return `${base}/calendar?${params.toString()}`;
  }

  return (
    <div>
      <MergedPageTabs
        header={
          <header>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </header>
        }
        actions={<LiveBadge live={live} />}
        defaultValue="battlecards"
        tabs={[
          {
            value: "battlecards",
            label: t("tabBattlecards", { count: battlecards.length }),
            content: loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-80" />
                <Skeleton className="h-64" />
              </div>
            ) : battlecards.length === 0 ? (
              <div className="bee-bento bee-bento-pad py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("battlecardsEmptyTitle")}</p>
                <p className="bee-caption mt-1">{t("battlecardsEmptySubtitle")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Stage segments — the former Pipeline tab, as a filter
                      on the one list. Counts are the battlecards themselves. */}
                  <div className="bee-filter-tabs" role="group" aria-label={t("stageFilter.aria")}>
                    {(["", ...STAGES] as const).map((s) => {
                      const count = s === "" ? battlecards.length : (countByStage.get(s) ?? 0);
                      return (
                        <button
                          key={s || "all"}
                          type="button"
                          aria-pressed={stage === s}
                          onClick={() => setStage(s)}
                          className={`bee-filter-tab ${stage === s ? "bee-filter-tab--active" : ""}`}
                        >
                          {s === "" ? t("stageFilter.all") : stageLabels[s]}
                          <span className="ml-1 tabular-nums opacity-70">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="flex items-center gap-2 bee-caption">
                    <Sigma className="size-3.5 shrink-0" aria-hidden />
                    {sample.closed > 0 ? t("sampleLine", { closed: sample.closed, won: sample.won }) : t("sampleLineEmpty")}
                  </p>
                </div>

                {filtered.length === 0 ? (
                  <div className="bee-bento bee-bento-pad py-8 text-center">
                    <p className="text-sm text-muted-foreground">{t("stageFilter.empty", { stage: stage ? stageLabels[stage] : "" })}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [grid-auto-rows:1fr]">
                      {pagination.pageItems.map((card) => (
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
                      page={pagination.page}
                      pageSize={pagination.pageSize}
                      totalPages={pagination.totalPages}
                      totalItems={pagination.totalItems}
                      onPageChange={pagination.goToPage}
                      onPageSizeChange={pagination.changePageSize}
                      itemLabel={t("battlecardsItemLabel")}
                    />
                  </>
                )}
              </div>
            ),
          },
          {
            value: "works",
            label: t("tabWorks", { count: works.length }),
            content: (
              <div className="space-y-4">
                <p className="bee-caption">{t("worksCaption")}</p>
                {loadingPatterns || loadingInsights ? <Skeleton className="h-40" /> : <WhatWorksList items={works} />}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
