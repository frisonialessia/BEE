"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useHiveLeads, useLeadBoard } from "@/hooks/queries/use-lead-board";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import {
  findHexAt,
  layoutHiveCells,
  renderHiveCanvas,
  TEMPERATURE_COLORS,
  type HiveHexCell,
} from "@/lib/visualization/honeycomb-hexbin";
import { cn } from "@/lib/utils";
import type { HotLeadScore } from "@/types/extended";
import { useDashboardBase } from "@/lib/demo/mode";

const STAGE_KEYS = ["awareness", "consideration", "decision", "ready_to_buy"] as const;

const HOVER_LERP_MS = 180;

interface SignalHexMapProps {
  className?: string;
  /** Inline style for the outer section — Resumen uses it for its grid span. */
  style?: React.CSSProperties;
  /** Canvas height in CSS pixels. */
  height?: number;
  maxLeads?: number;
}

function HiveTooltip({
  cell,
  x,
  y,
  containerWidth,
}: {
  cell: HiveHexCell;
  x: number;
  y: number;
  containerWidth: number;
}) {
  const t = useTranslations("shared.signalHexMap");
  const lead = cell.leads[0];
  const extra = cell.count - 1;

  return (
    <div
      className="bee-hex-tooltip pointer-events-none absolute z-20 w-56 rounded-lg p-4"
      style={{
        left: Math.min(Math.max(x + 12, 8), containerWidth - 240),
        top: Math.max(y - 8, 8),
        transform: "translateY(-100%)",
      }}
    >
      <p className="bee-eyebrow text-[var(--color-chart-5)]">
        {t("tooltip.closingTemperature", { temp: Math.round(cell.temperature) })}
      </p>
      <p className="mt-2 text-sm font-light leading-snug">
        {lead.company_name ?? lead.company_domain}
      </p>
      <p className="bee-micro">{lead.company_domain}</p>
      <div className="mt-2 flex flex-wrap gap-2 bee-micro">
        <span className="rounded-lg bg-muted px-2 py-1">
          {stageLabel(t, lead.buying_stage)}
        </span>
        {lead.is_hot && (
          <span className="rounded-lg bg-[var(--color-primary)] px-2 py-1 text-[var(--color-chart-5)]">
            {t("tooltip.hot")}
          </span>
        )}
      </div>
      {lead.top_intent_keywords.length > 0 && (
        <p className="mt-2 line-clamp-2 bee-micro">
          {lead.top_intent_keywords.slice(0, 3).join(" · ")}
        </p>
      )}
      {extra > 0 && (
        <p className="mt-2 bee-micro">{t("tooltip.more", { count: extra })}</p>
      )}
    </div>
  );
}

/** `buying_stage` off a lead is a free-form string from the backend — only
 *  the four known stages have a translated label, anything else (an
 *  unrecognized value) falls back to showing the raw string, same as the
 *  old `STAGE_LABELS[stage] ?? stage` lookup this replaces. */
function stageLabel(t: ReturnType<typeof useTranslations>, stage: string): string {
  return (STAGE_KEYS as readonly string[]).includes(stage)
    ? t(`stages.${stage}`)
    : stage;
}

/**
 * SignalHexMap — Colmena hexagonal heatmap of DarkFunnel closing temperature.
 *
 * Uses d3-hexbin for efficient aggregation + Canvas rendering for hundreds of leads.
 * Brand palette · smooth hover transitions · editorial hero layout.
 */
export function SignalHexMap({
  className,
  style,
  height = 360,
  maxLeads = 200,
}: SignalHexMapProps) {
  const t = useTranslations("shared.signalHexMap");
  const base = useDashboardBase();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverStrengthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 600, height });
  const [hovered, setHovered] = useState<HiveHexCell | null>(null);
  const [renderHover, setRenderHover] = useState<HiveHexCell | null>(null);
  const [hoverStrength, setHoverStrength] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const { data: result, isLoading } = useHiveLeads(maxLeads);
  const { data: boardResult } = useLeadBoard(200);
  const { openOpportunity } = useOpportunityDrawer();
  const leads: HotLeadScore[] = useMemo(() => result?.data ?? [], [result?.data]);

  const domainToOpportunity = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of boardResult?.cards ?? []) {
      if (card.company_name) {
        map.set(card.company_name.toLowerCase(), card.opportunity_id);
      }
      map.set(card.title.toLowerCase(), card.opportunity_id);
    }
    return map;
  }, [boardResult?.cards]);

  // Cell size comes out of the layout below: the comb is sized to fill the
  // box edge to edge, so the radius is whatever makes every cell fit.

  // The comb centers itself and grows to the box (layoutHiveCells), so no
  // width cap is needed to keep a sparse hive dense.

  // Desglose por etapa — igual patrón que "Opened/Clicked/Converted" de un
  // dashboard de rendimiento: 3 cifras clave con su barra de color, calculadas
  // de los leads ya obtenidos (no inventadas).
  const stageStats = useMemo(() => {
    if (leads.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.buying_stage] = (counts[l.buying_stage] ?? 0) + 1;
    const order: Array<{ stage: string; color: string }> = [
      // ready_to_buy used to be chart-2/orange — the same hue as
      // --destructive — for what's actually the best buying stage. Matches
      // the magenta STAGE_CONFIG uses for this stage in dark-funnel-dashboard.tsx.
      { stage: "ready_to_buy", color: "var(--color-chart-5)" },
      { stage: "decision", color: "var(--color-chart-1)" },
      { stage: "consideration", color: "var(--color-chart-3)" },
    ];
    return order.map(({ stage, color }) => ({
      stage,
      color,
      label: stageLabel(t, stage),
      pct: Math.round(((counts[stage] ?? 0) / leads.length) * 100),
    }));
  }, [leads, t]);

  const { cells, radius: hexRadius } = useMemo(
    () => layoutHiveCells(leads, size.width, size.height),
    [leads, size.width, size.height],
  );

  const redraw = useCallback(
    (hoverCell: HiveHexCell | null, strength: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderHiveCanvas(ctx, cells, size.width, size.height, hexRadius, hoverCell, strength);
    },
    [cells, size.width, size.height, hexRadius],
  );

  // Smooth hover strength animation
  useEffect(() => {
    hoverStrengthRef.current = hoverStrength;
  }, [hoverStrength]);

  useEffect(() => {
    const target = hovered ? 1 : 0;
    const start = performance.now();
    const from = hoverStrengthRef.current;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / HOVER_LERP_MS, 1);
      const eased = progress * (2 - progress);
      const next = from + (target - from) * eased;
      hoverStrengthRef.current = next;
      setHoverStrength(next);
      setRenderHover(hovered);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hovered]);

  useEffect(() => {
    redraw(renderHover, hoverStrength);
  }, [redraw, renderHover, hoverStrength]);

  // Re-attached when the canvas container appears: it only renders once
  // there are leads, and with `[]` deps the observer was set up while the
  // ref was still null on pages where leads load after mount (Control),
  // leaving the canvas at its 600px initial size — cut off on a phone.
  const hasLeads = leads.length > 0;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // Measure both dimensions off the container's real laid-out box —
      // used to hardcode height to the `height` prop and only measure
      // width, so the canvas always drew at exactly that literal px value
      // even when its flex-1 wrapper (min-height: height, not a fixed
      // height) ended up taller, leaving blank space below the canvas.
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      setSize({ width: w, height: h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLeads]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    redraw(renderHover, hoverStrength);
  }, [size, redraw, renderHover, hoverStrength]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPointer({
      x: mx,
      y: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0),
    });
    setHovered(findHexAt(cells, mx, my, hexRadius));
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cell = findHexAt(cells, mx, my, hexRadius);
    if (!cell) return;
    const lead = cell.leads[0];
    const keys = [
      lead.company_domain.toLowerCase(),
      (lead.company_name ?? "").toLowerCase(),
    ].filter(Boolean);
    let oppId: string | undefined;
    for (const k of keys) {
      oppId = domainToOpportunity.get(k);
      if (oppId) break;
    }
    if (oppId) openOpportunity(oppId);
  };

  const onMouseLeave = () => setHovered(null);

  return (
    <section
      className={cn("bee-glass relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] bee-bento-pad", className)}
      style={style}
      aria-label={t("sectionAriaLabel")}
    >
      {/* Hexágonos flotantes decorativos — puro CSS, no interactúan. */}
      <span className="bee-hex-float" style={{ width: 90, height: 104, top: -30, right: -20, animationDelay: "0s" }} aria-hidden />
      <span className="bee-hex-float" style={{ width: 56, height: 64, bottom: -16, left: 12, animationDelay: "1.4s" }} aria-hidden />
      <span className="bee-hex-float" style={{ width: 40, height: 46, top: "40%", right: 24, animationDelay: "2.6s" }} aria-hidden />
      <div className="relative z-[1] mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* Two lines (title + caption), same as every other Resumen
              section header (Embudo de cierre, Dónde eres más fuerte, …) —
              this used to run a 3rd bee-caption line above the title,
              heavier than any sibling section on the page. */}
          <h2 className="bee-card-title">{t("heading")}</h2>
          <p className="bee-caption mt-1">
            {t("caption", { count: leads.length })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href={`${base}/dark-funnel`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
          >
            {t("viewMore")}
            <ArrowUpRight className="size-3" />
          </Link>
          <div className="flex items-center gap-2 bee-micro">
            <span>{t("legend.cold")}</span>
            <div
              className="h-2 w-24 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${TEMPERATURE_COLORS.cool}, ${TEMPERATURE_COLORS.mild}, ${TEMPERATURE_COLORS.warm}, ${TEMPERATURE_COLORS.hot}, ${TEMPERATURE_COLORS.peak})`,
              }}
            />
            <span>{t("legend.hot")}</span>
          </div>
        </div>
      </div>

      {/* minHeight (not height) on this wrapper only — a floor, not a fixed
          size, so the canvas/empty-state/skeleton below (all h-full, no
          inline height of their own) actually fill whatever room a taller
          flex-1 parent gives them instead of getting pinned to the prop's
          literal px value with blank space left over underneath. Same
          "roomy container, small drawn content" bug the bar charts had. */}
      {/* min-w-0 + overflow-hidden: the canvas is a replaced element whose
          intrinsic width (last measured size, 600px before the first
          measurement) would otherwise feed back into the card's min-content
          width — the ResizeObserver then measured *that* inflated width and
          the hive stayed 600px wide on a 375px phone (see /probar). */}
      <div className="relative z-[1] min-h-0 w-full min-w-0 flex-1 overflow-hidden" style={{ minHeight: height }}>
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : leads.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-border px-4 text-center text-sm font-light text-[var(--color-text-muted)]">
            {t("empty")}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative h-full w-full"
          >
            <canvas
              ref={canvasRef}
              className={cn(
                "bee-hex-canvas cursor-crosshair",
                hovered && "bee-hex-canvas--active",
              )}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              onClick={onClick}
              role="img"
              aria-label={t("canvasAriaLabel", { count: leads.length })}
            />
            {hovered && (
              <HiveTooltip
                cell={hovered}
                x={pointer.x}
                y={pointer.y}
                containerWidth={size.width}
              />
            )}
          </div>
        )}
      </div>

      {stageStats.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-3">
          {stageStats.map((s) => (
            <div key={s.stage} className="flex items-center gap-4">
              <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: s.color }} />
              <div>
                <p className="text-base font-bold leading-none tabular-nums">{s.pct}%</p>
                <p className="mt-1 bee-micro leading-none">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
