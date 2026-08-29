"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";

import { TooltipContent } from "@/components/ui/tooltip";
import { createTemperatureColorScale } from "@/lib/visualization/honeycomb-hexbin";
import { computeIndustrySignalGrid, type IndustrySignalCell } from "@/lib/industry-signal-grid";
import { signalTypeLabels } from "@/lib/format";
import type { Company, Opportunity, Signal, SignalType } from "@/types/domain";

const SIGNAL_ORDER: SignalType[] = [
  "funding_round",
  "hiring",
  "tech_adoption",
  "leadership_change",
  "product_launch",
  "engagement",
  "news_mention",
  "expansion",
  "other",
];

const R = 27; // hex circumradius, px
const HEX_W = Math.sqrt(3) * R;
const HEX_H = 2 * R;
const ROW_STEP = HEX_H * 0.75;
const MAX_ROWS = 6;
const PAD = 12;
const LABEL_W = 128;
const HEADER_H = 70;

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/** Heatmap hexagonal: filas = industria, columnas = tipo de señal, color =
 * tasa de cierre de esa combinación. Cruza datos que hoy viven repartidos
 * entre Ganado/Perdido y Señales — ver lib/industry-signal-grid.ts. */
export function IndustrySignalHeatmap({
  opportunities,
  signals,
  companies,
}: {
  opportunities: Opportunity[];
  signals: Signal[];
  companies: Company[];
}) {
  const cells = computeIndustrySignalGrid(opportunities, signals, companies);

  if (cells.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay suficientes deals cerrados con industria y tipo de señal identificados para este mapa.
      </p>
    );
  }

  const totalByIndustry = new Map<string, number>();
  for (const c of cells) totalByIndustry.set(c.industry, (totalByIndustry.get(c.industry) ?? 0) + c.closedCount);
  const industries = [...totalByIndustry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ROWS)
    .map(([industry]) => industry);

  const presentSignalTypes = new Set(cells.map((c) => c.signalType));
  const signalTypes = SIGNAL_ORDER.filter((t) => presentSignalTypes.has(t));

  const byKey = new Map(cells.map((c) => [`${c.industry}::${c.signalType}`, c]));
  const color = createTemperatureColorScale();

  const width = LABEL_W + signalTypes.length * HEX_W + HEX_W / 2 + PAD * 2;
  const height = HEADER_H + industries.length * ROW_STEP + HEX_H / 2 + PAD;

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="flex h-full flex-col gap-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ aspectRatio: `${width} / ${height}`, overflow: "visible" }}
          role="img"
          aria-label="Tasa de cierre por industria y tipo de señal"
        >
          {signalTypes.map((t, ci) => {
            const x = LABEL_W + PAD + ci * HEX_W + HEX_W / 2;
            return (
              <text
                key={t}
                x={x}
                y={HEADER_H - 12}
                textAnchor="start"
                fontSize={11}
                fill="var(--color-muted-foreground)"
                transform={`rotate(-32 ${x} ${HEADER_H - 12})`}
              >
                {signalTypeLabels[t]}
              </text>
            );
          })}

          {industries.map((industry, ri) => {
            const y = HEADER_H + ri * ROW_STEP + R;
            return (
              <text
                key={industry}
                x={LABEL_W - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-foreground)"
              >
                {industry}
              </text>
            );
          })}

          {industries.map((industry, ri) =>
            signalTypes.map((signalType, ci) => {
              const cell = byKey.get(`${industry}::${signalType}`);
              const x =
                LABEL_W + PAD + ci * HEX_W + HEX_W / 2 + (ri % 2 === 1 ? HEX_W / 2 : 0);
              const y = HEADER_H + ri * ROW_STEP + R;

              if (!cell) {
                return (
                  <polygon
                    key={`${industry}::${signalType}`}
                    points={hexPoints(x, y, R - 1)}
                    fill="var(--color-muted)"
                    fillOpacity={0.25}
                    stroke="var(--color-border)"
                    strokeWidth={0.5}
                  />
                );
              }

              return (
                <HexCell key={`${industry}::${signalType}`} x={x} y={y} cell={cell} fill={color(cell.winRate * 100)} />
              );
            }),
          )}
        </svg>

        <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>Tasa de cierre:</span>
          <span className="h-2.5 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${color(0)}, ${color(50)}, ${color(100)})` }} />
          <span>0%</span>
          <span className="ml-auto">100%</span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

function HexCell({ x, y, cell, fill }: { x: number; y: number; cell: IndustrySignalCell; fill: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <g>
          <polygon points={hexPoints(x, y, R - 1)} fill={fill} fillOpacity={0.85} stroke="var(--color-border)" strokeWidth={0.75} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-background)">
            {Math.round(cell.winRate * 100)}%
          </text>
        </g>
      </TooltipPrimitive.Trigger>
      <TooltipContent>
        <p className="font-medium">
          {cell.industry} · {signalTypeLabels[cell.signalType]}
        </p>
        <p className="text-muted-foreground">
          {cell.wonCount} de {cell.closedCount} deals cerrados ganados ({Math.round(cell.winRate * 100)}%)
        </p>
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
