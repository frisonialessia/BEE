"use client";

import { Clock, Radar, ShieldCheck, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

import { computeFunnelStages, type FunnelStage } from "@/lib/pipeline-funnel";
import type { Opportunity } from "@/types/domain";

/** Mismo lenguaje de ícono por concepto que el resto de la app — Battlecard
 * listo reusa ShieldCheck, el mismo ícono que "Listas para acción" en el
 * KPI strip del dashboard real, en vez de inventar uno nuevo para la misma
 * idea. */
const STAGE_ICONS: Record<FunnelStage["key"], typeof Radar> = {
  detected: Radar,
  ready_to_action: ShieldCheck,
  in_progress: Clock,
  won: Trophy,
};

/** Embudo con % del pipeline por etapa — conecta los 4 números sueltos del
 * KPI strip en una sola narrativa: dónde se concentra el pipeline hoy, no
 * solo cuánto hay en cada bucket. Ver lib/pipeline-funnel.ts. */
export function PipelineFunnel({
  opportunities,
  className = "grid grid-cols-2 gap-4 sm:grid-cols-4",
  compact = false,
}: {
  opportunities: Opportunity[];
  /** Narrow tiles (Resumen's 2×2): sentence-case labels instead of the
   *  letter-spaced eyebrow, which clipped inside a 3-column box. */
  compact?: boolean;
  /** Grid classes for the four tiles — 2×2 inside a narrow Resumen box, one row elsewhere. */
  className?: string;
}) {
  const t = useTranslations("dashboardOverview.pipelineFunnel");
  // Reuses crm.board's own stage/status labels — same words a rep already
  // sees on the CRM board itself for "detected"/"ready_to_action"/
  // "in_progress", and the same "Won" the closed column uses — one
  // vocabulary for the same 4 concepts, not a second set of labels that
  // could drift from the first.
  const tStages = useTranslations("crm.board.stages");
  const tClosedStatus = useTranslations("crm.board.closedStatus");
  const STAGE_LABELS: Record<FunnelStage["key"], string> = {
    detected: tStages("detected"),
    ready_to_action: tStages("ready_to_action"),
    in_progress: tStages("in_progress"),
    won: tClosedStatus("won"),
  };
  const stages = computeFunnelStages(opportunities);
  // A stage at 0 is not a tile — it's one line under the tiles that says
  // which stages are empty, so the box never shows a row of dead zeros.
  const active = stages.filter((s) => s.count > 0);
  const empty = stages.filter((s) => s.count === 0);

  if (active.length === 0) {
    return <p className="bee-caption py-6 text-center">{t("allEmpty")}</p>;
  }

  return (
    <div className="flex h-full flex-col gap-3">
    <div className={className}>
      {active.map((stage) => {
        const Icon = STAGE_ICONS[stage.key];
        return (
          <div key={stage.key} className="bee-bento flex flex-col justify-between gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className={compact ? "bee-caption line-clamp-2 font-medium" : "bee-eyebrow line-clamp-2"}>{STAGE_LABELS[stage.key]}</p>
              <Icon className="size-3.5 shrink-0 text-muted-foreground stroke-[1.25]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="bee-kpi-sm">{stage.count}</span>
              {stage.shareOfPipeline !== null && (
                <span className="text-xs text-muted-foreground">
                  {t("shareOfPipeline", { pct: Math.round(stage.shareOfPipeline * 100) })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
    {empty.length > 0 && (
      <p className="bee-caption mt-auto">
        {t("noneIn", { stages: empty.map((s) => STAGE_LABELS[s.key]).join(" · ") })}
      </p>
    )}
    </div>
  );
}
