"use client";

import { useTranslations } from "next-intl";

import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA } from "@/components/charts/palette";

import { computeFunnelStages, type FunnelStage } from "@/lib/pipeline-funnel";
import type { Opportunity } from "@/types/domain";

/** Embudo con % del pipeline por etapa — conecta los 4 números sueltos del
 * KPI strip en una sola narrativa: dónde se concentra el pipeline hoy, no
 * solo cuánto hay en cada bucket. Ver lib/pipeline-funnel.ts. */
export function PipelineFunnel({
  opportunities,
  className,
}: {
  opportunities: Opportunity[];
  /** Kept for callers; the funnel is one column of thin bars now. */
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("dashboardOverview.pipelineFunnel");
  const tStages = useTranslations("crm.board.stages");
  const tClosedStatus = useTranslations("crm.board.closedStatus");
  const STAGE_LABELS: Record<FunnelStage["key"], string> = {
    detected: tStages("detected"),
    ready_to_action: tStages("ready_to_action"),
    in_progress: tStages("in_progress"),
    won: tClosedStatus("won"),
  };
  const STAGE_COLORS: Record<FunnelStage["key"], string> = {
    detected: DATA.indigo,
    ready_to_action: DATA.violet,
    in_progress: DATA.magenta,
    won: DATA.honey,
  };
  const stages = computeFunnelStages(opportunities);
  if (stages.every((s) => s.count === 0)) {
    return <p className="bee-caption py-6 text-center">{t("allEmpty")}</p>;
  }
  const total = stages.reduce((s, x) => s + x.count, 0);
  return (
    <div className={className ?? "flex h-full flex-col justify-center gap-3"}>
      <HorizontalFunnel rows={stages.map((s) => ({ label: STAGE_LABELS[s.key], value: s.count, color: STAGE_COLORS[s.key] }))} />
      <p className="bee-caption">{t("shareOfPipeline", { pct: total })}</p>
    </div>
  );
}
