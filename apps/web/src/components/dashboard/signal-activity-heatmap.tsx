"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";

import { useBoxSize } from "@/components/charts/use-box-size";
import { TooltipContent } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import { computeActivityGrid, getDayLabels, mostActiveCell } from "@/lib/signal-activity-grid";
import type { Signal } from "@/types/domain";

const GAP = 3;
const LABEL_W = 32;
const HEADER_H = 18;
const HOUR_MARKS = [0, 6, 12, 18];

/** Heatmap día × hora de cuándo llegan las señales de mercado — usa
 * `detected_at`, un dato que ya existe pero que hasta ahora no se
 * visualizaba así. Ver lib/signal-activity-grid.ts.
 *
 * El SVG escala por `viewBox` (width="100%" + aspect-ratio en CSS) en vez
 * de un tamaño en px fijo — así llena el ancho real de la tarjeta sin
 * importar cuánto más ancha sea que su vecina, en lugar de quedar
 * flotando chico con espacio en blanco alrededor. */
export function SignalActivityHeatmap({ signals }: { signals: Signal[] }) {
  const t = useTranslations("dashboardOverview.activityHeatmap");
  const locale = useLocale() as Locale;
  const dayLabels = getDayLabels(locale);
  // Cells shrink to the box, text never does: 1 SVG unit = 1 px, labels at
  // the standard body-2 size whatever the column width.
  const [ref, { width: boxW }] = useBoxSize<HTMLDivElement>({ width: 480, height: 160 });

  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const cells = computeActivityGrid(signals);
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  const CELL = Math.max(6, Math.floor((boxW - LABEL_W - 23 * GAP) / 24));
  const STEP = CELL + GAP;
  const width = LABEL_W + 24 * STEP;
  const height = HEADER_H + 7 * STEP;
  const peak = mostActiveCell(cells);

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="bee-fill flex flex-col gap-4">
        <div ref={ref} className="w-full min-w-0">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={t("ariaLabel")}>
          {HOUR_MARKS.map((h) => (
            <text key={h} x={LABEL_W + h * STEP + CELL / 2} y={HEADER_H - 6} textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-muted-foreground)">
              {h}h
            </text>
          ))}
          {dayLabels.map((label, day) => (
            <text key={label} x={LABEL_W - 8} y={HEADER_H + day * STEP + CELL / 2 + 4} textAnchor="end" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-muted-foreground)">
              {label}
            </text>
          ))}
          {cells.map((cell) => (
            <ActivitySquare key={`${cell.day}:${cell.hour}`} cell={cell} maxCount={maxCount} size={CELL} x={LABEL_W + cell.hour * STEP} y={HEADER_H + cell.day * STEP} />
          ))}
        </svg>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {peak ? (
              <>
                {t("peakActivity")} <span className="font-medium text-foreground">{dayLabels[peak.day]} ~{peak.hour}h</span>
              </>
            ) : (
              t("noActivity")
            )}
          </span>
          <span className="flex items-center gap-2">
            {t("less")}
            <span className="flex gap-1">
              {[0.1, 0.35, 0.6, 0.85, 1].map((o) => (
                <span key={o} className="size-2.5 rounded-sm" style={{ background: "var(--color-chart-4)", opacity: o }} />
              ))}
            </span>
            {t("more")}
          </span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

function ActivitySquare({
  cell,
  maxCount,
  size,
  x,
  y,
}: {
  cell: { day: number; hour: number; count: number };
  maxCount: number;
  size: number;
  x: number;
  y: number;
}) {
  const t = useTranslations("dashboardOverview.activityHeatmap");
  const dayLabels = getDayLabels(useLocale() as Locale);
  const opacity = cell.count === 0 ? 0.08 : 0.18 + 0.82 * (cell.count / maxCount);
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          rx={Math.min(3, size / 4)}
          fill="var(--color-chart-4)"
          fillOpacity={opacity}
        />
      </TooltipPrimitive.Trigger>
      <TooltipContent>
        <p className="font-medium">
          {dayLabels[cell.day]} · {cell.hour}:00–{cell.hour}:59
        </p>
        <p className="text-muted-foreground">{t("signalsDetected", { count: cell.count })}</p>
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
