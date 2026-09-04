"use client";

import { useTranslations } from "next-intl";

import { DATA, mix } from "@/components/charts/palette";

import { computeFunnelStages, type FunnelStage } from "@/lib/pipeline-funnel";
import type { Opportunity } from "@/types/domain";

/** Embudo de cierre — dónde está el pipeline hoy, en el menor espacio que
 *  lo cuenta entero: una barra segmentada (una porción por etapa, ancho =
 *  participación) y debajo cuatro tiles con conteo y porcentaje. Antes eran
 *  cuatro filas finas que dejaban la caja medio vacía. Los colores son los
 *  de las columnas del CRM, para que la etapa se lea igual en ambos lados.
 *  Ver lib/pipeline-funnel.ts. */
export function PipelineFunnel({
  opportunities,
  className,
}: {
  opportunities: Opportunity[];
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
    <div className={className ?? "flex flex-col gap-3"}>
      <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={t("shareOfPipeline", { pct: total })}>
        {stages
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.key}
              title={`${STAGE_LABELS[s.key]} · ${s.count}`}
              className="h-full border-r-2 border-[var(--color-card)] last:border-r-0"
              style={{ width: `${(s.count / total) * 100}%`, background: STAGE_COLORS[s.key] }}
            />
          ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {stages.map((s) => (
          <li key={s.key} className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-1.5 text-sm" style={{ background: mix(STAGE_COLORS[s.key], 18) }}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: STAGE_COLORS[s.key] }} />
            <span className="min-w-0 flex-1 truncate">{STAGE_LABELS[s.key]}</span>
            <span className="shrink-0 font-bold tabular-nums">{s.count}</span>
            <span className="w-9 shrink-0 text-right bee-micro tabular-nums">{total ? Math.round((s.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
      <p className="bee-caption">{t("shareOfPipeline", { pct: total })}</p>
    </div>
  );
}
