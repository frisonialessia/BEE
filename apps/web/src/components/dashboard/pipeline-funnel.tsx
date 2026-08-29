"use client";

import { Sparkline } from "@/components/sparkline";
import { computeFunnelStages } from "@/lib/pipeline-funnel";
import { bucketByDay } from "@/lib/trend";
import type { Opportunity } from "@/types/domain";

/** Embudo con conversión + tendencia de 7 días por etapa — conecta los 4
 * números sueltos del KPI strip en una sola narrativa: dónde se atasca el
 * pipeline, no solo cuánto hay en cada bucket. Ver lib/pipeline-funnel.ts. */
export function PipelineFunnel({ opportunities }: { opportunities: Opportunity[] }) {
  const stages = computeFunnelStages(opportunities);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stages.map((stage) => (
        <div key={stage.key} className="bee-bento bee-bento-pad-lg space-y-2">
          <p className="bee-eyebrow">{stage.label}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{stage.count}</span>
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
          {stage.timestamps.length > 0 ? (
            <Sparkline values={bucketByDay(stage.timestamps, 7)} width={96} height={24} />
          ) : (
            <div className="h-6" />
          )}
        </div>
      ))}
    </div>
  );
}
