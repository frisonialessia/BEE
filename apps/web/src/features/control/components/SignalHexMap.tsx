"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useHiveLeads, useLeadBoard } from "@/hooks/queries/use-lead-board";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import {
  binLeadPoints,
  findHexAt,
  leadsToPoints,
  renderHiveCanvas,
  TEMPERATURE_COLORS,
  type HiveHexCell,
} from "@/lib/visualization/honeycomb-hexbin";
import { cn } from "@/lib/utils";
import type { HotLeadScore } from "@/types/extended";

const STAGE_LABELS: Record<string, string> = {
  awareness: "Conocimiento",
  consideration: "Consideración",
  decision: "Decisión",
  ready_to_buy: "Listo para comprar",
};

const HOVER_LERP_MS = 180;

interface SignalHexMapProps {
  className?: string;
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
        Temperatura de cierre · {Math.round(cell.temperature)}°
      </p>
      <p className="mt-1.5 text-sm font-light leading-snug">
        {lead.company_name ?? lead.company_domain}
      </p>
      <p className="bee-micro">{lead.company_domain}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 bee-micro">
        <span className="rounded-lg bg-muted px-2 py-0.5">
          {STAGE_LABELS[lead.buying_stage] ?? lead.buying_stage}
        </span>
        {lead.is_hot && (
          <span className="rounded-lg bg-[var(--color-primary)] px-2 py-0.5 text-[var(--color-chart-5)]">
            CALIENTE
          </span>
        )}
      </div>
      {lead.top_intent_keywords.length > 0 && (
        <p className="mt-2 line-clamp-2 bee-micro">
          {lead.top_intent_keywords.slice(0, 3).join(" · ")}
        </p>
      )}
      {extra > 0 && (
        <p className="mt-1.5 bee-micro">+{extra} más en esta celda</p>
      )}
    </div>
  );
}

/**
 * SignalHexMap — Colmena hexagonal heatmap of DarkFunnel closing temperature.
 *
 * Uses d3-hexbin for efficient aggregation + Canvas rendering for hundreds of leads.
 * Brand palette · smooth hover transitions · editorial hero layout.
 */
export function SignalHexMap({
  className,
  height = 360,
  maxLeads = 200,
}: SignalHexMapProps) {
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
  const leads: HotLeadScore[] = result?.data ?? [];

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

  const hexRadius = useMemo(() => {
    if (leads.length > 150) return 14;
    if (leads.length > 80) return 16;
    // A sparse Dark Funnel (a handful of leads, common early on) used to
    // draw at the same 18px radius as a mid-size one — small hexagons in a
    // wide-open canvas read as "almost empty". Growing them further as the
    // count drops keeps each cell visually substantial instead of shrinking
    // it to match a data volume the canvas has plenty of room for.
    if (leads.length > 20) return 18;
    return 24;
  }, [leads.length]);

  // Spreading the jitter above (leadsToPoints) only redistributes leads
  // *within* their fixed stage column — it can't fix the real emptiness,
  // which is that 4 stage columns plotted across a wide hero card leave
  // huge gaps between them no matter how the points inside each one are
  // jittered. The landing mock never has this problem because its card is
  // a fixed ~220px regardless of data. Capping the actual plotted width to
  // the data volume (instead of always stretching to the card's full
  // width) reproduces that density here too, and grows toward full width
  // once there's enough real data to use it honestly.
  const contentWidth = useMemo(() => {
    if (leads.length === 0 || leads.length >= 60) return undefined;
    return Math.max(300, 140 + leads.length * 26);
  }, [leads.length]);

  // Desglose por etapa — igual patrón que "Opened/Clicked/Converted" de un
  // dashboard de rendimiento: 3 cifras clave con su barra de color, calculadas
  // de los leads ya obtenidos (no inventadas).
  const stageStats = useMemo(() => {
    if (leads.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.buying_stage] = (counts[l.buying_stage] ?? 0) + 1;
    const order: Array<{ stage: string; color: string }> = [
      { stage: "ready_to_buy", color: "var(--color-chart-2)" },
      { stage: "decision", color: "var(--color-chart-1)" },
      { stage: "consideration", color: "var(--color-chart-3)" },
    ];
    return order.map(({ stage, color }) => ({
      stage,
      color,
      label: STAGE_LABELS[stage] ?? stage,
      pct: Math.round(((counts[stage] ?? 0) / leads.length) * 100),
    }));
  }, [leads]);

  const cells = useMemo(() => {
    if (leads.length === 0 || size.width <= 0) return [];
    const points = leadsToPoints(leads, size.width, size.height);
    return binLeadPoints(points, hexRadius);
  }, [leads, size.width, size.height, hexRadius]);

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
      const t = Math.min((now - start) / HOVER_LERP_MS, 1);
      const eased = t * (2 - t);
      const next = from + (target - from) * eased;
      hoverStrengthRef.current = next;
      setHoverStrength(next);
      setRenderHover(hovered);

      if (t < 1) {
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
  }, []);

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
      aria-label="Mapa hexagonal de señales — mapa de calor de la colmena"
    >
      {/* Hexágonos flotantes decorativos — puro CSS, no interactúan. */}
      <span className="bee-hex-float" style={{ width: 90, height: 104, top: -30, right: -20, animationDelay: "0s" }} aria-hidden />
      <span className="bee-hex-float" style={{ width: 56, height: 64, bottom: -16, left: 12, animationDelay: "1.4s" }} aria-hidden />
      <span className="bee-hex-float" style={{ width: 40, height: 46, top: "40%", right: 24, animationDelay: "2.6s" }} aria-hidden />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Two lines (title + caption), same as every other Resumen
              section header (Embudo de cierre, Dónde eres más fuerte, …) —
              this used to run a 3rd bee-caption line above the title,
              heavier than any sibling section on the page. */}
          <h2 className="bee-card-title">Colmena de intención</h2>
          <p className="bee-caption mt-0.5">
            Dark Funnel · {leads.length} leads · haz clic en una celda para ver detalles
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/dashboard/dark-funnel"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
          >
            Ver más
            <ArrowUpRight className="size-3" />
          </Link>
          <div className="flex items-center gap-2 bee-micro">
            <span>Frío</span>
            <div
              className="h-2 w-24 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${TEMPERATURE_COLORS.cool}, ${TEMPERATURE_COLORS.mild}, ${TEMPERATURE_COLORS.warm}, ${TEMPERATURE_COLORS.hot}, ${TEMPERATURE_COLORS.peak})`,
              }}
            />
            <span>Caliente</span>
          </div>
        </div>
      </div>

      {/* minHeight (not height) on this wrapper only — a floor, not a fixed
          size, so the canvas/empty-state/skeleton below (all h-full, no
          inline height of their own) actually fill whatever room a taller
          flex-1 parent gives them instead of getting pinned to the prop's
          literal px value with blank space left over underneath. Same
          "roomy container, small drawn content" bug the bar charts had. */}
      <div className="relative min-h-0 flex-1" style={{ minHeight: height }}>
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-2xl" />
        ) : leads.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border-2 border-dashed border-border text-sm font-light text-[var(--color-text-muted)]">
            Todavía no hay leads del Dark Funnel — las señales de intención van a poblar la colmena.
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative h-full w-full"
            style={contentWidth ? { maxWidth: contentWidth, margin: "0 auto" } : undefined}
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
              aria-label={`Mapa de calor hexagonal de ${leads.length} leads por temperatura de cierre`}
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
            <div key={s.stage} className="flex items-center gap-2.5">
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
