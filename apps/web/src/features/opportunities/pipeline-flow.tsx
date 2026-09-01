"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { KANBAN_COLUMNS, groupLeadCards, opportunityToLeadCard } from "@/lib/control/lead-board";
import type { LeadColumnId } from "@/types/control";
import type { Opportunity } from "@/types/domain";

// Mismo mapeo de color que las columnas del Kanban de Control (LeadWorkspace), para que
// una etapa se vea igual en las dos vistas.
const COLUMN_COLOR: Record<LeadColumnId, string> = {
  detected: "var(--color-chart-3)",
  enriching: "var(--color-chart-1)",
  ready_to_action: "var(--color-chart-6)",
  in_progress: "var(--color-chart-4)",
  closed: "var(--color-text-muted)",
};

// WIDTH used to be 640 with labels starting at TARGET_X + BAR_W + 12 = 582 —
// only 58 units left before the SVG's own right edge clipped whatever didn't
// fit. "Listas para actuar", the longest COLUMN_LABELS entry, needs ~115
// units at this font size — it (and "Enriqueciendo") were being cut off
// mid-word. 720 leaves enough room for the longest label plus margin.
const WIDTH = 720;
const HEIGHT = 300;
const SOURCE_X = 12;
const TARGET_X = 560;
const BAR_W = 10;
const GAP = 6;
const MIN_SEGMENT_H = 14;

interface FlowSegment {
  id: LeadColumnId;
  count: number;
  sourceTop: number;
  sourceBottom: number;
  targetTop: number;
  targetBottom: number;
}

function bandPath(x0: number, y0top: number, y0bot: number, x1: number, y1top: number, y1bot: number) {
  const xm = (x0 + x1) / 2;
  return `M${x0},${y0top} C${xm},${y0top} ${xm},${y1top} ${x1},${y1top} L${x1},${y1bot} C${xm},${y1bot} ${xm},${y0bot} ${x0},${y0bot} Z`;
}

/**
 * PipelineFlow — de dónde vienen y a dónde van las oportunidades, de un
 * vistazo. No es un Sankey histórico (BEE no registra cada transición de
 * etapa) — son los conteos actuales de cada etapa, mostrados como un flujo
 * desde el total hacia cada grupo. Mismas etapas y colores que el Kanban.
 */
export function PipelineFlow({ opportunities }: { opportunities: Opportunity[] }) {
  const t = useTranslations("opportunitiesPriority.pipelineFlow");
  const { segments, total, closedBreakdown } = useMemo(() => {
    const cards = opportunities.map(opportunityToLeadCard);
    const grouped = groupLeadCards(cards);
    const total = opportunities.length;

    const closedBreakdown = {
      won: opportunities.filter((o) => o.status === "won").length,
      lost: opportunities.filter((o) => o.status === "lost").length,
      dismissed: opportunities.filter((o) => o.status === "dismissed").length,
    };

    const availableH = HEIGHT - GAP * (KANBAN_COLUMNS.length - 1);
    // Cada segmento avanza los cursores fuente/destino del anterior — un
    // reduce en vez de un .map() con variables reasignadas por fuera, para
    // que cada paso quede como un valor nuevo, no una mutación compartida.
    const { segments } = KANBAN_COLUMNS.reduce(
      (acc, col) => {
        const count = grouped[col.id]?.length ?? 0;
        // Sin este piso, una etapa en 0 colapsa a h=0 — su centro (donde se
        // ancla la etiqueta "0 · Nombre") cae exactamente sobre el de
        // cualquier otra etapa también en 0, así que sus textos se dibujan
        // uno encima del otro. MIN_SEGMENT_H es suficiente alto para
        // separar esos centros más que el propio texto de la etiqueta.
        const h =
          total > 0
            ? Math.max((count / total) * availableH, MIN_SEGMENT_H)
            : availableH / KANBAN_COLUMNS.length;
        const seg: FlowSegment = {
          id: col.id,
          count,
          sourceTop: acc.cursorSource,
          sourceBottom: acc.cursorSource + h,
          targetTop: acc.cursorTarget,
          targetBottom: acc.cursorTarget + h,
        };
        return {
          segments: [...acc.segments, seg],
          cursorSource: acc.cursorSource + h,
          cursorTarget: acc.cursorTarget + h + GAP,
        };
      },
      { segments: [] as FlowSegment[], cursorSource: 0, cursorTarget: 0 },
    );

    return { segments, total, closedBreakdown };
  }, [opportunities]);

  if (total === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="bee-surface bee-bento-pad">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 bee-card-title">{t("title", { count: total })}</h2>
        </div>
      </div>

      {/* maxWidth caps this SVG at its own natural size (1 viewBox unit =
          1px by design) — width="100%"/w-full alone stretches it to fill
          whatever the card's width happens to be, and every fontSize below
          is set in viewBox units, so the {count} · {label} text would scale
          up right along with a wide card instead of staying a fixed size,
          the same bug already fixed for the Colmena and the Industria×Señal
          heatmap. Still shrinks to fit a narrow card/viewport. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ maxWidth: WIDTH, marginInline: "auto", display: "block" }}
        role="img"
        aria-label={t("ariaLabel")}
      >
        {/* Barra fuente — el total, sin dividir, porque es un solo flujo de origen */}
        <rect x={SOURCE_X} y={0} width={BAR_W} height={HEIGHT} rx={4} fill="var(--color-primary)" />

        {segments.map((seg) => (
          <path
            key={seg.id}
            d={bandPath(
              SOURCE_X + BAR_W,
              seg.sourceTop,
              seg.sourceBottom,
              TARGET_X,
              seg.targetTop,
              seg.targetBottom,
            )}
            fill={COLUMN_COLOR[seg.id]}
            opacity={0.28}
          />
        ))}

        {segments.map((seg) => (
          <rect
            key={`bar-${seg.id}`}
            x={TARGET_X}
            y={seg.targetTop}
            width={BAR_W}
            height={Math.max(seg.targetBottom - seg.targetTop, 2)}
            rx={4}
            fill={COLUMN_COLOR[seg.id]}
          />
        ))}

        {segments.map((seg) => (
          <text
            key={`label-${seg.id}`}
            x={TARGET_X + BAR_W + 12}
            y={(seg.targetTop + seg.targetBottom) / 2}
            dominantBaseline="middle"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {seg.count} · {t(`columns.${seg.id}`)}
          </text>
        ))}
      </svg>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("closedBreakdown.label")}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--success)" }} />
          {t("closedBreakdown.won", { count: closedBreakdown.won })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--destructive)" }} />
          {t("closedBreakdown.lost", { count: closedBreakdown.lost })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          {t("closedBreakdown.dismissed", { count: closedBreakdown.dismissed })}
        </span>
      </div>
    </div>
  );
}
