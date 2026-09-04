"use client";

import { useTranslations } from "next-intl";

import { REST, SALES } from "@/components/charts/palette";
import { computeFunnelStages, type FunnelStage } from "@/lib/pipeline-funnel";
import type { Opportunity } from "@/types/domain";

/**
 * Embudo de cierre — where the pipeline stands today, in the least space
 * that tells it whole: one segmented bar (a slice per stage, width = share)
 * and under it a row per stage with count and share. Each stage wears the
 * color of its CRM column (light honey for what BEE detected, honey when
 * the play is ready, indigo for a conversation open), and what closed
 * wears the sales green — the funnel reads exactly like the board. See
 * lib/pipeline-funnel.ts.
 */
export function PipelineFunnel({ opportunities, className }: { opportunities: Opportunity[]; className?: string }) {
  const t = useTranslations("dashboardOverview.pipelineFunnel");
  const tStages = useTranslations("crm.board.stages");
  const tClosedStatus = useTranslations("crm.board.closedStatus");
  const LABELS: Record<FunnelStage["key"], string> = {
    detected: tStages("detected"),
    ready_to_action: tStages("ready_to_action"),
    in_progress: tStages("in_progress"),
    won: tClosedStatus("won"),
  };
  const FILL: Record<FunnelStage["key"], string> = {
    detected: "var(--color-chart-3)",
    ready_to_action: "var(--color-chart-1)",
    in_progress: "var(--color-chart-4)",
    won: SALES.won,
  };
  const stages = computeFunnelStages(opportunities);
  if (stages.every((s) => s.count === 0)) {
    return <p className="bee-caption py-6 text-center">{t("allEmpty")}</p>;
  }
  const total = stages.reduce((s, x) => s + x.count, 0);
  return (
    <div className={className ?? "bee-fill flex flex-col justify-evenly gap-4"}>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: REST }} role="img" aria-label={t("shareOfPipeline", { pct: total })}>
        {stages
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.key} title={`${LABELS[s.key]} · ${s.count}`} className="h-full border-r-2 border-[var(--color-card)] last:border-r-0" style={{ width: `${(s.count / total) * 100}%`, background: FILL[s.key] }} />
          ))}
      </div>
      <ul className="flex flex-col">
        {stages.map((s) => (
          <li key={s.key} className="bee-row text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: FILL[s.key] }} />
            <span className="min-w-0 flex-1 truncate">{LABELS[s.key]}</span>
            <span className="shrink-0 font-bold tabular-nums">{s.count}</span>
            <span className="w-9 shrink-0 text-right bee-caption tabular-nums">{total ? Math.round((s.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
      <p className="bee-caption">{t("shareOfPipeline", { pct: total })}</p>
    </div>
  );
}
