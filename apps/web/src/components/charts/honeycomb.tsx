"use client";

import { useMemo, useState, type ReactNode } from "react";

import { HIVE_RAMP, REST } from "@/components/charts/palette";
import { useBoxSize } from "@/components/charts/use-box-size";
import { hexagonPath, layoutRadialHive, rampIndex } from "@/lib/visualization/honeycomb-radial";
import { cn } from "@/lib/utils";

export interface HiveItem {
  id: string;
  /** 0–100: decides the rank (hottest in the centre) and the color step. */
  heat: number;
  label: string;
  caption?: string;
  /** A second line under the caption in the tooltip. */
  detail?: string;
}

/**
 * The BEE honeycomb — one component for every hive in the product: the
 * Resumen's centre, Señales' intent view, an account's panel and the
 * landing demo. Items sort by heat, the hottest lands in the centre cell
 * and the rest spiral outward; the fill walks HIVE_RAMP from the deep
 * honey centre to the lavender edge, by steps. Empty positions of the ring
 * in progress are drawn hollow so a young hive still reads as a comb.
 * Fills its box (use-box-size). Numbers only on hover.
 */
export function Honeycomb({
  items,
  onSelect,
  maxRadius = 26,
  minHeight = 200,
  className,
  emptyHint,
  ariaLabel,
}: {
  items: HiveItem[];
  onSelect?: (item: HiveItem) => void;
  maxRadius?: number;
  minHeight?: number;
  className?: string;
  /** Shown centred when there is nothing to draw yet. */
  emptyHint?: ReactNode;
  ariaLabel?: string;
}) {
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  const [hover, setHover] = useState<number | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => b.heat - a.heat), [items]);
  const layout = useMemo(() => layoutRadialHive(sorted.length, W, H, { maxRadius }), [sorted.length, W, H, maxRadius]);
  const steps = HIVE_RAMP.length;

  if (sorted.length === 0) {
    return (
      <div ref={ref} className={cn("bee-fill grid w-full place-items-center", className)} style={{ minHeight }}>
        <EmptyComb width={Math.min(W, 260)} />
        {emptyHint && <p className="bee-caption absolute bottom-2 text-center">{emptyHint}</p>}
      </div>
    );
  }

  const active = hover !== null ? sorted[hover] : null;
  const activeCell = hover !== null ? layout.cells[hover] : null;

  return (
    <div ref={ref} className={cn("bee-fill relative w-full", className)} style={{ minHeight }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {layout.ghosts.map((g, i) => (
          <path key={`g${i}`} d={hexagonPath(g.x, g.y, layout.radius - 1)} fill={REST} />
        ))}
        {layout.cells.map((c, i) => {
          const item = sorted[i];
          const fill = HIVE_RAMP[rampIndex(i, c.ring, sorted.length, steps)];
          const dim = hover !== null && hover !== i;
          return (
            <path
              key={item.id}
              d={hexagonPath(c.x, c.y, layout.radius - 1)}
              fill={fill}
              stroke="var(--color-card)"
              strokeWidth={1}
              opacity={dim ? 0.55 : 1}
              className={cn("transition-opacity duration-150", onSelect && "cursor-pointer")}
              onMouseEnter={() => setHover(i)}
              onClick={onSelect ? () => onSelect(item) : undefined}
            >
              <title>{`${item.label}${item.caption ? ` · ${item.caption}` : ""}`}</title>
            </path>
          );
        })}
      </svg>
      {active && activeCell && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-[var(--radius-sm)] bg-[var(--color-text)] px-3 py-2 text-[var(--color-card)]",
            activeCell.x / W > 0.7 ? "-translate-x-full" : activeCell.x / W < 0.3 ? "translate-x-0" : "-translate-x-1/2",
          )}
          style={{ left: activeCell.x, top: Math.max(0, activeCell.y - layout.radius - 8), transform: undefined }}
        >
          <p className="truncate text-sm font-semibold">{active.label}</p>
          {active.caption && <p className="bee-micro !text-[var(--color-card)] opacity-80">{active.caption}</p>}
          {active.detail && <p className="bee-micro !text-[var(--color-card)] opacity-80">{active.detail}</p>}
        </div>
      )}
    </div>
  );
}

/** A hollow seven-cell comb: the shape before the first account arrives. */
function EmptyComb({ width }: { width: number }) {
  const layout = layoutRadialHive(7, width, width * 0.7, { maxRadius: 22 });
  return (
    <svg width={width} height={width * 0.7} viewBox={`0 0 ${width} ${width * 0.7}`} aria-hidden>
      {layout.cells.map((c, i) => (
        <path key={i} d={hexagonPath(c.x, c.y, layout.radius - 1)} fill={REST} />
      ))}
    </svg>
  );
}
