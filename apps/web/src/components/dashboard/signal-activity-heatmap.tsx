"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";

import { REST, TONE, heat, tint } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import { TooltipContent } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/locales";
import { computeActivityGrid, getDayLabels, mostActiveCell } from "@/lib/signal-activity-grid";
import type { Signal } from "@/types/domain";

const GAP = 3;
const LABEL_W = 32;
const HEADER_H = 18;
const HOUR_MARKS = [0, 6, 12, 18];
const PROFILE_LABEL_H = 18;

/** Heatmap día × hora de cuándo llegan las señales de mercado — usa
 * `detected_at`, un dato que ya existe pero que hasta ahora no se
 * visualizaba así. Ver lib/signal-activity-grid.ts. Una sola tonalidad,
 * la miel del mercado, en tres pasos + gris (`heat`).
 *
 * Dos lecturas en una caja, ambas midiendo su espacio (use-box-size): la
 * cuadrícula día × hora arriba, con celdas cuadradas que se ajustan al
 * ancho, y debajo el perfil por hora — 24 barras alineadas con las
 * columnas — que toma toda la altura que sobra, así la caja nunca termina
 * en una banda vacía y la hora pico se ve, no solo se lee. Texto siempre en
 * el tamaño estándar (1 unidad SVG = 1 px). */
export function SignalActivityHeatmap({ signals }: { signals: Signal[] }) {
  const t = useTranslations("dashboardOverview.activityHeatmap");
  // The measured box must exist on the first render (use-box-size reads
  // its ref once), so the empty state is decided here and the drawing
  // mounts only with data.
  if (signals.length === 0) return <p className="bee-caption">{t("empty")}</p>;
  return <ActivityGrid signals={signals} />;
}

function ActivityGrid({ signals }: { signals: Signal[] }) {
  const t = useTranslations("dashboardOverview.activityHeatmap");
  const locale = useLocale() as Locale;
  const dayLabels = getDayLabels(locale);
  const [ref, { width: boxW }] = useBoxSize<HTMLDivElement>({ width: 320, height: 160 });
  const [profileRef, { height: profileH }] = useBoxSize<HTMLDivElement>({ width: 320, height: 80 });

  const cells = computeActivityGrid(signals);
  const maxCount = Math.max(...cells.map((c) => c.count), 1);
  const CELL = Math.max(6, Math.floor((boxW - LABEL_W - 23 * GAP) / 24));
  const STEP = CELL + GAP;
  const width = LABEL_W + 24 * STEP;
  const height = HEADER_H + 7 * STEP;
  const peak = mostActiveCell(cells);

  const byHour = Array.from({ length: 24 }, (_, h) => cells.filter((c) => c.hour === h).reduce((s, c) => s + c.count, 0));
  const maxHour = Math.max(...byHour, 1);
  const barArea = Math.max(24, profileH - PROFILE_LABEL_H);

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="bee-fill flex flex-col gap-3">
        <div ref={ref} className="w-full min-w-0">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={t("ariaLabel")}>
            {HOUR_MARKS.map((h) => (
              <text key={h} x={LABEL_W + h * STEP + CELL / 2} y={HEADER_H - 6} textAnchor="middle" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-text-muted)">
                {h}h
              </text>
            ))}
            {dayLabels.map((label, day) => (
              <text key={label} x={LABEL_W - 8} y={HEADER_H + day * STEP + CELL / 2 + 4} textAnchor="end" style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-text-muted)">
                {label}
              </text>
            ))}
            {cells.map((cell) => (
              <ActivitySquare key={`${cell.day}:${cell.hour}`} cell={cell} maxCount={maxCount} size={CELL} x={LABEL_W + cell.hour * STEP} y={HEADER_H + cell.day * STEP} />
            ))}
          </svg>
        </div>

        {/* Hour profile: the same 24 columns, as bars, filling the rest. */}
        <div ref={profileRef} className="min-h-0 w-full min-w-0 flex-1">
          <svg width={width} height={Math.max(profileH, PROFILE_LABEL_H + 24)} viewBox={`0 0 ${width} ${Math.max(profileH, PROFILE_LABEL_H + 24)}`} className="block" aria-hidden>
            <text x={LABEL_W} y={12} style={{ fontSize: "var(--bee-fs-body-2)" }} fill="var(--color-text-muted)">
              {t("hourProfile")}
            </text>
            {byHour.map((count, h) => {
              const barH = count === 0 ? 2 : Math.max(3, Math.round((count / maxHour) * (barArea - 4)));
              const isPeak = peak?.hour === h;
              return (
                <TooltipPrimitive.Root key={h}>
                  <TooltipPrimitive.Trigger asChild>
                    <rect
                      x={LABEL_W + h * STEP}
                      y={PROFILE_LABEL_H + barArea - barH}
                      width={CELL}
                      height={barH}
                      rx={Math.min(3, CELL / 4)}
                      fill={isPeak ? TONE.market : heat(TONE.market, count / maxHour)}
                    />
                  </TooltipPrimitive.Trigger>
                  <TooltipContent>
                    <p className="font-medium">
                      {h}:00–{h}:59
                    </p>
                    <p className="text-muted-foreground">{t("signalsDetected", { count })}</p>
                  </TooltipContent>
                </TooltipPrimitive.Root>
              );
            })}
          </svg>
        </div>

        <div className="bee-caption flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-divider)] pt-3">
          <span>
            {peak ? (
              <>
                {t("peakActivity")} <span className="font-medium text-[var(--color-text)]">{dayLabels[peak.day]} ~{peak.hour}h</span>
              </>
            ) : (
              t("noActivity")
            )}
          </span>
          <span className="flex items-center gap-2">
            {t("less")}
            <span className="flex gap-1">
              {[REST, tint(TONE.market, 45), tint(TONE.market, 70), TONE.market].map((c) => (
                <span key={c} className="size-2.5 rounded-sm" style={{ background: c, boxShadow: c === REST ? "inset 0 0 0 1px var(--color-divider)" : undefined }} />
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
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <rect x={x} y={y} width={size} height={size} rx={Math.min(3, size / 4)} fill={heat(TONE.market, cell.count / maxCount)} />
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
