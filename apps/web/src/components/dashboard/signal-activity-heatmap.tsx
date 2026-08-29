"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";

import { TooltipContent } from "@/components/ui/tooltip";
import { computeActivityGrid, DAY_LABELS, mostActiveCell } from "@/lib/signal-activity-grid";
import type { Signal } from "@/types/domain";

const CELL = 22;
const GAP = 4;
const STEP = CELL + GAP;
const LABEL_W = 34;
const HEADER_H = 20;
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
  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay señales para mapear por horario.</p>;
  }

  const cells = computeActivityGrid(signals);
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  const width = LABEL_W + 24 * STEP;
  const height = HEADER_H + 7 * STEP;
  const peak = mostActiveCell(cells);

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="flex h-full flex-col gap-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ aspectRatio: `${width} / ${height}` }}
          role="img"
          aria-label="Actividad de señales por día y hora"
        >
          {HOUR_MARKS.map((h) => (
            <text key={h} x={LABEL_W + h * STEP + CELL / 2} y={HEADER_H - 7} textAnchor="middle" fontSize={11} fill="var(--color-muted-foreground)">
              {h}h
            </text>
          ))}
          {DAY_LABELS.map((label, day) => (
            <text key={label} x={LABEL_W - 8} y={HEADER_H + day * STEP + CELL / 2 + 4} textAnchor="end" fontSize={11} fill="var(--color-muted-foreground)">
              {label}
            </text>
          ))}
          {cells.map((cell) => (
            <ActivitySquare key={`${cell.day}:${cell.hour}`} cell={cell} maxCount={maxCount} x={LABEL_W + cell.hour * STEP} y={HEADER_H + cell.day * STEP} />
          ))}
        </svg>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {peak ? (
              <>
                Pico de actividad: <span className="font-medium text-foreground">{DAY_LABELS[peak.day]} ~{peak.hour}h</span>
              </>
            ) : (
              "Sin actividad registrada todavía."
            )}
          </span>
          <span className="flex items-center gap-1.5">
            Menos
            <span className="flex gap-0.5">
              {[0.1, 0.35, 0.6, 0.85, 1].map((o) => (
                <span key={o} className="size-2.5 rounded-[2px]" style={{ background: "var(--color-chart-4)", opacity: o }} />
              ))}
            </span>
            Más
          </span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

function ActivitySquare({
  cell,
  maxCount,
  x,
  y,
}: {
  cell: { day: number; hour: number; count: number };
  maxCount: number;
  x: number;
  y: number;
}) {
  const opacity = cell.count === 0 ? 0.08 : 0.18 + 0.82 * (cell.count / maxCount);
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <rect
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          rx={3}
          fill="var(--color-chart-4)"
          fillOpacity={opacity}
        />
      </TooltipPrimitive.Trigger>
      <TooltipContent>
        <p className="font-medium">
          {DAY_LABELS[cell.day]} · {cell.hour}:00–{cell.hour}:59
        </p>
        <p className="text-muted-foreground">
          {cell.count} {cell.count === 1 ? "señal detectada" : "señales detectadas"}
        </p>
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
