"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Honeycomb, type HiveItem } from "@/components/charts/honeycomb";
import { HIVE_RAMP, REST } from "@/components/charts/palette";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useHiveLeads, useLeadBoard } from "@/hooks/queries/use-lead-board";
import { cn } from "@/lib/utils";
import type { HotLeadScore } from "@/types/extended";

/** The four buying stages, hot → cool — the order of the pills above the comb. */
export const HIVE_STAGES = ["ready_to_buy", "decision", "consideration", "awareness"] as const;
export type HiveStage = (typeof HIVE_STAGES)[number];
const STAGES = HIVE_STAGES;
type Stage = HiveStage;

/** The ramp step each buying stage reads in the metrics under the comb —
 *  the same steps its cells tend to land on (hot centre → cool edge). */
export const STAGE_STEP: Record<Stage, number> = { ready_to_buy: 0, decision: 3, consideration: 7, awareness: 9 };

export function stageOf(lead: HotLeadScore): Stage {
  return (STAGES as readonly string[]).includes(lead.buying_stage) ? (lead.buying_stage as Stage) : "awareness";
}

/**
 * The intent hive with real data — every account the Dark Funnel is
 * watching as one cell, hottest in the centre. Clicking a cell opens the
 * account's opportunity when it has one. Under the comb, the four buying
 * stages with their counts and a bar in the ramp step their cells take.
 * `stage` filters the comb to one stage (Señales · Intención).
 */
export function IntentHive({
  maxLeads = 200,
  maxRadius = 30,
  minHeight = 240,
  stage,
  showStages = true,
  className,
}: {
  maxLeads?: number;
  maxRadius?: number;
  minHeight?: number;
  stage?: Stage | null;
  showStages?: boolean;
  className?: string;
}) {
  const t = useTranslations("shared.intentHive");
  const { data: result, isLoading } = useHiveLeads(maxLeads);
  const { data: boardResult } = useLeadBoard(200);
  const { openOpportunity } = useOpportunityDrawer();

  const leads = useMemo(() => result?.data ?? [], [result?.data]);
  const byName = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of boardResult?.cards ?? []) {
      if (card.company_name) map.set(card.company_name.toLowerCase(), card.opportunity_id);
      map.set(card.title.toLowerCase(), card.opportunity_id);
    }
    return map;
  }, [boardResult?.cards]);

  const items = useMemo<HiveItem[]>(
    () =>
      leads
        .filter((l) => !stage || stageOf(l) === stage)
        .map((l) => ({
          id: l.id,
          heat: l.research_intensity_score,
          label: l.company_name ?? l.company_domain,
          caption: `${t(`stages.${stageOf(l)}`)} · ${t("score", { score: Math.round(l.research_intensity_score) })}`,
          detail: l.top_intent_keywords.slice(0, 3).join(" · ") || undefined,
        })),
    [leads, stage, t],
  );

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { ready_to_buy: 0, decision: 0, consideration: 0, awareness: 0 };
    for (const l of leads) c[stageOf(l)] += 1;
    return c;
  }, [leads]);
  const maxCount = Math.max(1, ...STAGES.map((s) => counts[s]));

  function handleSelect(item: HiveItem) {
    const lead = leads.find((l) => l.id === item.id);
    if (!lead) return;
    const id = byName.get((lead.company_name ?? "").toLowerCase()) ?? byName.get(lead.company_domain.toLowerCase());
    if (id) openOpportunity(id);
  }

  if (isLoading) return <Skeleton className={cn("w-full", className)} style={{ minHeight }} />;

  return (
    <div className={cn("bee-fill flex min-h-0 flex-col", className)}>
      <Honeycomb items={items} onSelect={handleSelect} maxRadius={maxRadius} minHeight={minHeight} emptyHint={t("empty")} ariaLabel={t("aria", { count: items.length })} />
      {showStages && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--color-divider)] pt-4 sm:grid-cols-4">
          {STAGES.map((s) => (
            <div key={s} className="min-w-0">
              <p className="bee-caption truncate">{t(`stages.${s}`)}</p>
              <p className="text-lg font-bold leading-tight tabular-nums">{counts[s]}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: REST }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((counts[s] / maxCount) * 100)}%`, background: HIVE_RAMP[STAGE_STEP[s]] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
