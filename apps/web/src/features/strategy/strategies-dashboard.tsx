"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { pairPatternsWithInsights, WhatWorksList } from "@/components/strategy/what-works-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/features/crm/drawer/primitives";
import { STAGE_ACCENT } from "@/features/crm/drawer/stage-meta";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { WinRateBars } from "@/features/strategy/win-rate-bars";
import { usePagination } from "@/hooks/use-pagination";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useSuccessPatterns } from "@/hooks/queries/use-feedback";
import { useMarketInsights } from "@/hooks/queries/use-market-insights";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";
import { formatChannel, formatPlaybook, getOpportunityStatusLabels } from "@/lib/format";
import { closedDealSample, computeStrategyEvidence, type StrategyEvidence } from "@/lib/strategy-evidence";
import { CLOSED_OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/types/domain";

/** What a card shows while its evidence map is still being built — never a
 *  made-up figure, just the honest "no history" state. */
const NO_EVIDENCE: StrategyEvidence = { basis: "none", sampleSize: 0, won: 0, winRate: null, daysToClose: null, industry: null };

/** The open stages a battlecard can be in, in pipeline order — the pills
 *  of the stage filter. Closed ones never have a battlecard ready to act. */
const STAGES = ["detected", "ready_to_action", "prioritized", "in_progress"] as const;
type Stage = (typeof STAGES)[number];

/** Estrategias — what BEE prepared, in two tabs under one KPI strip: the
 *  battlecards (one white box each, filtered by pipeline stage) and "Qué
 *  funciona" — the win rate per argument as ranked bars, with the patterns
 *  and the market signal behind each one as rows beside it. */
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
  const [stage, setStage] = useState<Stage | "">("");

  const battlecards = useMemo(() => battlecardsResult?.data ?? [], [battlecardsResult]);
  const opportunities = useMemo(() => allOppsResult?.data ?? [], [allOppsResult]);
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

  // The strip: ready battlecards, how much of the open pipeline has one,
  // the argument that closes best, and the stage holding the most deals.
  const readyCount = battlecards.filter((b) => b.ready_to_action).length;
  const coverage = useMemo(() => {
    const open = opportunities.filter((o) => !CLOSED_OPPORTUNITY_STATUSES.includes(o.status));
    const withCard = new Set(battlecards.map((b) => b.opportunity_id));
    const covered = open.filter((o) => withCard.has(o.id)).length;
    return { open: open.length, covered, share: open.length ? covered / open.length : null };
  }, [opportunities, battlecards]);
  const bestPattern = useMemo(() => [...patterns].sort((a, b) => b.win_rate - a.win_rate || b.sample_size - a.sample_size)[0] ?? null, [patterns]);
  const topStage = useMemo(() => {
    const counts = new Map<Stage, number>();
    for (const o of opportunities) if ((STAGES as readonly string[]).includes(o.status)) counts.set(o.status as Stage, (counts.get(o.status as Stage) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [opportunities]);

  const sample = useMemo(() => closedDealSample(opportunities), [opportunities]);
  const evidenceById = useMemo(() => {
    const ctx = { opportunities, signals: signalsResult?.data ?? [], companies: companiesResult?.data ?? [], patterns };
    return new Map(battlecards.map((card) => [card.opportunity_id, computeStrategyEvidence(card, ctx)]));
  }, [battlecards, opportunities, signalsResult, companiesResult, patterns]);

  const works = useMemo(() => pairPatternsWithInsights(patterns, insights), [patterns, insights]);

  function calendarHrefFor(opportunityId: string, company: string | null): string {
    const params = new URLSearchParams({ new: "1", opportunity: opportunityId });
    if (company) params.set("title", company);
    return `${base}/calendar?${params.toString()}`;
  }

  const battlecardsTab = loading ? (
    <div className="bee-overview">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-72 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 4" }} />
      ))}
    </div>
  ) : battlecards.length === 0 ? (
    <div className="bee-overview">
      <OverviewCard span={12} title={t("battlecardsEmptyTitle")} className="lg:min-h-0!">
        <p className="bee-caption">{t("battlecardsEmptySubtitle")}</p>
      </OverviewCard>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Stage pills — the former Pipeline tab, as a filter on the one
            list. Each pressed pill takes its stage's own fill. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("stageFilter.aria")}>
          <Pill pressed={stage === ""} fill={TONE.calm} onClick={() => setStage("")}>
            {t("stageFilter.all")} <span className="ml-1 tabular-nums opacity-70">{battlecards.length}</span>
          </Pill>
          {STAGES.map((s) => (
            <Pill key={s} pressed={stage === s} fill={STAGE_ACCENT[s]} onClick={() => setStage(stage === s ? "" : s)}>
              {stageLabels[s]} <span className="ml-1 tabular-nums opacity-70">{countByStage.get(s) ?? 0}</span>
            </Pill>
          ))}
        </div>
        <p className="bee-caption">{sample.closed > 0 ? t("sampleLine", { closed: sample.closed, won: sample.won }) : t("sampleLineEmpty")}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="bee-caption">{t("stageFilter.empty", { stage: stage ? stageLabels[stage] : "" })}</p>
      ) : (
        <>
          <div className="bee-overview">
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
  );

  const worksTab =
    loadingPatterns || loadingInsights ? (
      <div className="bee-overview">
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 7" }} />
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" style={{ gridColumn: "span 5" }} />
      </div>
    ) : (
      <div className="bee-overview">
        <OverviewCard span={7} title={t("works.barsTitle")} caption={sample.closed > 0 ? t("sampleLine", { closed: sample.closed, won: sample.won }) : t("sampleLineEmpty")} className="lg:min-h-[22rem]!">
          <WinRateBars patterns={patterns} />
        </OverviewCard>
        <OverviewCard span={5} title={t("works.listTitle")} caption={t("worksCaption")} className="lg:min-h-[22rem]!">
          <WhatWorksList items={works} />
        </OverviewCard>
      </div>
    );

  return (
    <MergedPageTabs
      header={
        <header className="min-w-0">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1 truncate">{t("title")}</h1>
          <p className="bee-caption mt-1 line-clamp-2">{t("subtitle")}</p>
        </header>
      }
      actions={<LiveBadge live={live} />}
      defaultValue="battlecards"
      belowTabs={
        <StatStrip cols={4}>
          <StatTile label={t("kpis.ready")} value={readyCount} hint={t("kpis.readyHint", { count: battlecards.length })} tone={TONE.prepared} />
          <StatTile
            label={t("kpis.coverage")}
            value={coverage.share === null ? "—" : `${Math.round(coverage.share * 100)}%`}
            hint={t("kpis.coverageHint", { covered: coverage.covered, open: coverage.open })}
            progress={coverage.share ?? undefined}
            tone={TONE.market}
          />
          <StatTile
            label={t("kpis.bestArgument")}
            value={bestPattern ? `${Math.round(bestPattern.win_rate * 100)}%` : "—"}
            hint={
              bestPattern
                ? t("kpis.bestArgumentHint", { playbook: formatPlaybook(bestPattern.playbook, locale), channel: formatChannel(bestPattern.channel, locale), count: bestPattern.sample_size })
                : t("kpis.bestArgumentEmpty")
            }
            tone={TONE.urgency}
          />
          <StatTile label={t("kpis.topStage")} value={topStage ? topStage[1] : "—"} hint={topStage ? t("kpis.topStageHint", { stage: stageLabels[topStage[0]] }) : t("kpis.topStageEmpty")} tone={TONE.forecast} />
        </StatStrip>
      }
      tabs={[
        { value: "battlecards", label: t("tabBattlecards", { count: battlecards.length }), content: battlecardsTab },
        { value: "works", label: t("tabWorks", { count: works.length }), content: worksTab },
      ]}
    />
  );
}
