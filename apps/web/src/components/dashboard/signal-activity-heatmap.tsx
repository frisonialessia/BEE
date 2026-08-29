"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";

import { TooltipContent } from "@/components/ui/tooltip";
import { computeActivityGrid, DAY_LABELS } from "@/lib/signal-activity-grid";
import type { Signal } from "@/types/domain";

const CELL = 13;
const GAP = 2;
const STEP = CELL + GAP;
const LABEL_W = 28;
const HEADER_H = 16;
const HOUR_MARKS = [0, 6, 12, 18];

/** Heatmap día × hora de cuándo llegan las señales de mercado — usa
 * `detected_at`, un dato que ya existe pero que hasta ahora no se
 * visualizaba así. Ver lib/signal-activity-grid.ts. */
export function SignalActivityHeatmap({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay señales para mapear por horario.</p>;
  }

  const cells = computeActivityGrid(signals);
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  const width = LABEL_W + 24 * STEP;
  const height = HEADER_H + 7 * STEP;

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Actividad de señales por día y hora">
          {HOUR_MARKS.map((h) => (
            <text key={h} x={LABEL_W + h * STEP + CELL / 2} y={HEADER_H - 5} textAnchor="middle" fontSize={9} fill="var(--color-muted-foreground)">
              {h}h
            </text>
          ))}
          {DAY_LABELS.map((label, day) => (
            <text key={label} x={LABEL_W - 6} y={HEADER_H + day * STEP + CELL / 2 + 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">
              {label}
            </text>
          ))}
          {cells.map((cell) => (
            <ActivitySquare key={`${cell.day}:${cell.hour}`} cell={cell} maxCount={maxCount} x={LABEL_W + cell.hour * STEP} y={HEADER_H + cell.day * STEP} />
          ))}
        </svg>
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
          rx={2}
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
