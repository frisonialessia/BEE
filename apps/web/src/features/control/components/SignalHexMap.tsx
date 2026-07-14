"use client";

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
  awareness: "Awareness",
  consideration: "Consideration",
  decision: "Decision",
  ready_to_buy: "Ready to buy",
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
      className="bee-hex-tooltip pointer-events-none absolute z-20 w-56 rounded-2xl bg-[var(--color-card)] p-4 shadow-[var(--bee-shadow)]"
      style={{
        left: Math.min(Math.max(x + 12, 8), containerWidth - 240),
        top: Math.max(y - 8, 8),
        transform: "translateY(-100%)",
      }}
    >
      <p className="bee-eyebrow text-[var(--color-chart-5)]">
        Closing temp · {Math.round(cell.temperature)}°
      </p>
      <p className="mt-1.5 text-sm font-light leading-snug">
        {lead.company_name ?? lead.company_domain}
      </p>
      <p className="text-[11px] text-muted-foreground">{lead.company_domain}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-lg bg-muted px-2 py-0.5">
          {STAGE_LABELS[lead.buying_stage] ?? lead.buying_stage}
        </span>
        {lead.is_hot && (
          <span className="rounded-lg bg-[var(--color-primary)] px-2 py-0.5 text-[var(--color-chart-5)]">
            HOT
          </span>
        )}
      </div>
      {lead.top_intent_keywords.length > 0 && (
        <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">
          {lead.top_intent_keywords.slice(0, 3).join(" · ")}
        </p>
      )}
      {extra > 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">+{extra} more in cell</p>
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
    return 18;
  }, [leads.length]);

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
      const w = Math.floor(entry.contentRect.width);
      setSize({ width: w, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

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
      className={cn("bee-surface flex flex-col p-5", className)}
      aria-label="Signal hex map — hive heatmap"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="bee-eyebrow">Colmena</h2>
          <p className="bee-caption mt-0.5">{leads.length} leads · click cell to inspect</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Cool</span>
          <div
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${TEMPERATURE_COLORS.cool}, ${TEMPERATURE_COLORS.mild}, ${TEMPERATURE_COLORS.warm}, ${TEMPERATURE_COLORS.hot}, ${TEMPERATURE_COLORS.peak})`,
            }}
          />
          <span>Hot</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" style={{ minHeight: height }}>
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-2xl" style={{ height }} />
        ) : leads.length === 0 ? (
          <div
            className="flex h-full items-center justify-center rounded-2xl bg-[var(--color-primary)]/40 text-sm font-light text-[var(--color-text-muted)]"
            style={{ height }}
          >
            No dark funnel leads yet — intent signals will populate the hive.
          </div>
        ) : (
          <div ref={containerRef} className="relative h-full w-full" style={{ height }}>
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
              aria-label={`Hexagonal heatmap of ${leads.length} leads by closing temperature`}
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
    </section>
  );
}
