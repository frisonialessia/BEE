"use client";

import { Clock, Radar, ShieldCheck, Trophy } from "lucide-react";

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
export function PipelineFunnel({ opportunities }: { opportunities: Opportunity[] }) {
  const stages = computeFunnelStages(opportunities);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stages.map((stage) => {
        const Icon = STAGE_ICONS[stage.key];
        return (
          <div key={stage.key} className="bee-bento space-y-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="bee-eyebrow">{stage.label}</p>
              <Icon className="size-3.5 shrink-0 text-muted-foreground stroke-[1.25]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="bee-kpi-sm">{stage.count}</span>
              {stage.shareOfPipeline !== null && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(stage.shareOfPipeline * 100)}% del pipeline
                </span>
              )}
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--color-chart-4)]"
                style={{ width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
