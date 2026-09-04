"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";

import { useBoxSize } from "@/components/charts/use-box-size";
import { TooltipContent } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import { DATA, SALES } from "@/components/charts/palette";
import { computeIndustrySignalGrid, type IndustrySignalCell } from "@/lib/industry-signal-grid";
import { getSignalTypeLabels } from "@/lib/format";
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

const MAX_COLS = 5; // industries across
const MAX_ROWS = 6; // signal types down
const MAX_R = 30; // hex circumradius cap, px
const PAD = 6;
const LABEL_W = 150; // signal-type labels, one line each
const HEADER_H = 40; // two lines of industry labels

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/** Matriz hexagonal: filas = tipo de señal (etiqueta completa a la
 * izquierda, una línea), columnas = industria (una línea arriba), color =
 * tasa de cierre de esa combinación. Cruza datos que hoy viven repartidos
 * entre Ganado/Perdido y Señales — ver lib/industry-signal-grid.ts.
 *
 * La matriz mide su caja (use-box-size) y reparte columnas y filas en todo
 * el ancho y alto disponibles; el hexágono es el mayor que cabe en su
 * celda. Así ninguna etiqueta se corta ni se gira, y la caja se llena sea
 * cual sea la altura que le dé su vecina. Texto en tamaño estándar (1
 * unidad SVG = 1 px). */
export function IndustrySignalHeatmap({
  opportunities,
  signals,
  companies,
}: {
  opportunities: Opportunity[];
  signals: Signal[];
  companies: Company[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.industryHeatmap");
  const signalTypeLabels = getSignalTypeLabels(locale);
  const cells = computeIndustrySignalGrid(opportunities, signals, companies);
  const [ref, { width: boxW, height: boxH }] = useBoxSize<HTMLDivElement>({ width: 640, height: 240 });

  if (cells.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const totalByIndustry = new Map<string, number>();
  for (const c of cells) totalByIndustry.set(c.industry, (totalByIndustry.get(c.industry) ?? 0) + c.closedCount);
  const industries = [...totalByIndustry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COLS)
    .map(([industry]) => industry);

  // Only rows that have a cell in one of the shown columns, and at most
  // MAX_ROWS of them by closed deals — a row of empty hexagons tells the
  // rep nothing and only shrinks every other cell.
  const shown = new Set(industries);
  const closedBySignal = new Map<SignalType, number>();
  for (const c of cells) if (shown.has(c.industry)) closedBySignal.set(c.signalType, (closedBySignal.get(c.signalType) ?? 0) + c.closedCount);
  const signalTypes = SIGNAL_ORDER.filter((s) => closedBySignal.has(s))
    .sort((a, b) => (closedBySignal.get(b) ?? 0) - (closedBySignal.get(a) ?? 0))
    .slice(0, MAX_ROWS)
    .sort((a, b) => SIGNAL_ORDER.indexOf(a) - SIGNAL_ORDER.indexOf(b));

  const byKey = new Map(cells.map((c) => [`${c.industry}::${c.signalType}`, c]));
  // Close rate is a sales reading, so the scale is the sales family: honey at
  // 0 % (nothing closed yet) warming through mint and lime to the won green
  // at 100 %. No indigo/lilac here — those belong to signals, not to money.
  const color = (pct: number) => {
    const stops: [number, string][] = [[0, DATA.honeyFill], [34, SALES.mint], [67, SALES.lime], [100, SALES.won]];
    const v = Math.max(0, Math.min(100, pct));
    for (let i = 1; i < stops.length; i++) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      if (v <= b) {
        const k = Math.round(((v - a) / (b - a)) * 100);
        return `color-mix(in srgb, ${cb} ${k}%, ${ca})`;
      }
    }
    return SALES.won;
  };

  const cols = Math.max(1, industries.length);
  const rows = Math.max(1, signalTypes.length);
  const width = Math.max(boxW, LABEL_W + cols * 60);
  const height = Math.max(boxH, HEADER_H + rows * 30);
  const colStep = (width - LABEL_W - PAD) / cols;
  const rowStep = (height - HEADER_H - PAD) / rows;
  const R = Math.max(9, Math.min(MAX_R, rowStep / 2 - 2, colStep / Math.sqrt(3) - 2));
  const cx = (ci: number) => LABEL_W + PAD + ci * colStep + colStep / 2;
  const cy = (ri: number) => HEADER_H + PAD + ri * rowStep + rowStep / 2;

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="bee-fill flex flex-col gap-3">
        <div ref={ref} className="min-h-0 w-full min-w-0 flex-1" style={{ minHeight: HEADER_H + 4 * 30 }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={t("ariaLabel")}>
            {industries.map((industry, ci) => {
              // Two lines at most so neighbouring column labels never overlap
              // ("Datos / Analytics" next to "Diseño de producto").
              const words = industry.split(" ");
              const lines = words.length > 1 && industry.length > 12 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [industry];
              return (
                <text key={industry} x={cx(ci)} y={HEADER_H - 8 - (lines.length - 1) * 13} textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-muted-foreground)">
                  {lines.map((line, i) => (
                    <tspan key={i} x={cx(ci)} dy={i === 0 ? 0 : 13}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}
            {signalTypes.map((signalType, ri) => (
              <text key={signalType} x={LABEL_W - 8} y={cy(ri) + 4} textAnchor="end" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-foreground)">
                {signalTypeLabels[signalType]}
              </text>
            ))}
            {signalTypes.map((signalType, ri) =>
              industries.map((industry, ci) => {
                const cell = byKey.get(`${industry}::${signalType}`);
                if (!cell) {
                  return (
                    <polygon
                      key={`${industry}::${signalType}`}
                      points={hexPoints(cx(ci), cy(ri), R - 1)}
                      fill="var(--color-muted)"
                      fillOpacity={0.25}
                      stroke="var(--color-border)"
                      strokeWidth={0.5}
                    />
                  );
                }
                return <HexCell key={`${industry}::${signalType}`} x={cx(ci)} y={cy(ri)} r={R} cell={cell} fill={color(cell.winRate * 100)} />;
              }),
            )}
          </svg>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{t("legendLabel")}</span>
          <span className="h-2.5 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${color(0)}, ${color(34)}, ${color(67)}, ${color(100)})` }} />
          <span>0%</span>
          <span className="ml-auto">100%</span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

function HexCell({ x, y, r, cell, fill }: { x: number; y: number; r: number; cell: IndustrySignalCell; fill: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.industryHeatmap");
  const signalTypeLabels = getSignalTypeLabels(locale);

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <g>
          <polygon points={hexPoints(x, y, r - 1)} fill={fill} fillOpacity={0.85} stroke="var(--color-border)" strokeWidth={0.75} />
          {/* The rate only when the cell is big enough for it; smaller cells
              keep it for the hover tooltip. */}
          {r >= 16 && (
            <text x={x} y={y + 4} textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }} fontWeight={600} fill="var(--color-text)">
              {Math.round(cell.winRate * 100)}%
            </text>
          )}
        </g>
      </TooltipPrimitive.Trigger>
      <TooltipContent>
        <p className="font-medium">
          {cell.industry} · {signalTypeLabels[cell.signalType]}
        </p>
        <p className="text-muted-foreground">
          {t("tooltipDeals", { won: cell.wonCount, closed: cell.closedCount, pct: Math.round(cell.winRate * 100) })}
        </p>
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
