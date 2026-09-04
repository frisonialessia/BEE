"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";

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

const R = 20; // hex circumradius, px
const HEX_W = Math.sqrt(3) * R;
const HEX_H = 2 * R;
const ROW_STEP = HEX_H * 0.75;
const MAX_ROWS = 5;
const PAD = 10;
const LABEL_W = 104;
const HEADER_H = 66;

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
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.industryHeatmap");
  const signalTypeLabels = getSignalTypeLabels(locale);
  const cells = computeIndustrySignalGrid(opportunities, signals, companies);

  if (cells.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
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

  const width = LABEL_W + signalTypes.length * HEX_W + HEX_W / 2 + PAD * 2;
  const height = HEADER_H + industries.length * ROW_STEP + HEX_H / 2 + PAD;

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="bee-fill flex flex-col gap-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{
            aspectRatio: `${width} / ${height}`,
            overflow: "visible",
            // width="100%" alone stretches this SVG to fill however wide
            // its card happens to be — and every <text> fontSize below is
            // set in viewBox units, not real CSS px, so it scales up right
            // along with the grid. On a wide card that blew the row/column
            // labels up to 2-3x the app's standard 11px captions (nothing
            // else in the app draws labels this way — they're all
            // fixed-size HTML text) and inflated this card's height past
            // its "Cuándo llega el mercado" sibling. maxWidth caps it at
            // the grid's own natural size (1 viewBox unit = 1px by design)
            // and centers it — still shrinks to fit a narrow card/viewport,
            // it just never grows past its intended size.
            maxWidth: width,
            marginInline: "auto",
            display: "block",
          }}
          role="img"
          aria-label={t("ariaLabel")}
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
          <span>{t("legendLabel")}</span>
          <span className="h-2.5 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${color(0)}, ${color(34)}, ${color(67)}, ${color(100)})` }} />
          <span>0%</span>
          <span className="ml-auto">100%</span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

function HexCell({ x, y, cell, fill }: { x: number; y: number; cell: IndustrySignalCell; fill: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.industryHeatmap");
  const signalTypeLabels = getSignalTypeLabels(locale);

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <g>
          <polygon points={hexPoints(x, y, R - 1)} fill={fill} fillOpacity={0.85} stroke="var(--color-border)" strokeWidth={0.75} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-text)">
            {Math.round(cell.winRate * 100)}%
          </text>
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
