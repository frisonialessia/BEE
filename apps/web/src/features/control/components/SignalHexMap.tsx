"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useHiveLeads } from "@/hooks/queries/use-lead-board";
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
      className="pointer-events-none absolute z-20 w-56 rounded-xl bg-background/95 p-3 shadow-[0_8px_32px_-8px_rgba(139,69,19,0.25)] backdrop-blur-sm"
      style={{
        left: Math.min(Math.max(x + 12, 8), containerWidth - 240),
        top: Math.max(y - 8, 8),
        transform: "translateY(-100%)",
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--bee-terracotta)]">
        Closing temp · {Math.round(cell.temperature)}°
      </p>
      <p className="mt-1 text-sm font-light leading-snug">
        {lead.company_name ?? lead.company_domain}
      </p>
      <p className="text-[11px] text-muted-foreground">{lead.company_domain}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-md bg-muted px-1.5 py-0.5">
          {STAGE_LABELS[lead.buying_stage] ?? lead.buying_stage}
        </span>
        {lead.is_hot && (
          <span className="rounded-md bg-[var(--bee-terracotta)]/15 px-1.5 py-0.5 text-[var(--bee-terracotta)]">
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
 * Terracotta/ochre palette · hover tooltip with lead detail.
 */
export function SignalHexMap({
  className,
  height = 280,
  maxLeads = 200,
}: SignalHexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 600, height });
  const [hovered, setHovered] = useState<HiveHexCell | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const { data: result, isLoading } = useHiveLeads(maxLeads);
  const leads: HotLeadScore[] = result?.data ?? [];

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
    (hoverCell: HiveHexCell | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderHiveCanvas(ctx, cells, size.width, size.height, hexRadius, hoverCell);
    },
    [cells, size.width, size.height, hexRadius],
  );

  useEffect(() => {
    redraw(hovered);
  }, [redraw, hovered]);

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
    redraw(hovered);
  }, [size, redraw, hovered]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPointer({ x: mx, y: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0) });
    setHovered(findHexAt(cells, mx, my, hexRadius));
  };

  const onMouseLeave = () => setHovered(null);

  return (
    <section
      className={cn("bee-surface p-6", className)}
      aria-label="Signal hex map — hive heatmap"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Colmena
          </h2>
          <p className="mt-1 text-xs font-light text-muted-foreground">
            Closing temperature · DarkFunnelService · {leads.length} leads
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Cool</span>
          <div
            className="h-2 w-24 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${TEMPERATURE_COLORS.cool}, ${TEMPERATURE_COLORS.warm}, ${TEMPERATURE_COLORS.hot}, ${TEMPERATURE_COLORS.blaze})`,
            }}
          />
          <span>Hot</span>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="w-full rounded-xl" style={{ height }} />
      ) : leads.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-xl bg-muted/20 text-sm font-light text-muted-foreground"
          style={{ height }}
        >
          No dark funnel leads yet — intent signals will populate the hive.
        </div>
      ) : (
        <div ref={containerRef} className="relative w-full" style={{ height }}>
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-xl"
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
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
    </section>
  );
}
