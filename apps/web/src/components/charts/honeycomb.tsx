"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  /** CSS color of the tag a person picked for the account, drawn as a small dot. */
  mark?: string | null;
  /** A per-item color for the cell's own outline — how "group by X"
   *  reads (see IntentHive's industry toggle): the caller sorts items by
   *  the group before heat so same-group cells land adjacent in the
   *  spiral, and passes each group's color here so the outline confirms
   *  the cluster visually instead of only by position. Doesn't touch the
   *  fill — heat still owns that. */
  groupColor?: string | null;
}

/** Where a cell sits, handed back on selection so a menu can anchor to it. */
export interface HiveCellAnchor {
  x: number;
  y: number;
  radius: number;
  /** Width of the hive box, to decide which side a menu opens on. */
  width: number;
  height: number;
}

/** A small ▲/▼ path, centred at (x, y) — the movement indicator (see
 *  `pulsing` below), not a hexagon so it never gets mistaken for a cell. */
function arrowPath(x: number, y: number, size: number, up: boolean): string {
  const dir = up ? -1 : 1;
  return `M${x},${y - dir * size} L${x - size},${y + dir * size} L${x + size},${y + dir * size} Z`;
}

/**
 * The BEE honeycomb — one component for every hive in the product: the
 * Resumen's centre, Señales' intent view, an account's panel and the
 * landing demo. Items sort by heat, the hottest lands in the centre cell
 * and the rest spiral outward; the fill walks HIVE_RAMP from the deep
 * honey centre to the lavender edge, by steps. Empty positions of the ring
 * in progress are drawn hollow so a young hive still reads as a comb.
 *
 * Every cell is keyed by its item, so when a temperature changes the cell
 * slides to its new place and its fill crossfades (.bee-hive-cell) instead
 * of the comb redrawing. Fills its box (use-box-size). Numbers only on
 * hover; a click hands the item and its anchor to `onSelect`.
 */
export function Honeycomb({
  items,
  onSelect,
  selectedId = null,
  maxRadius = 26,
  minHeight = 200,
  className,
  emptyHint,
  ariaLabel,
  legend,
}: {
  items: HiveItem[];
  onSelect?: (item: HiveItem, anchor: HiveCellAnchor) => void;
  /** The cell a menu is open for: drawn at full strength while the rest dim. */
  selectedId?: string | null;
  maxRadius?: number;
  minHeight?: number;
  className?: string;
  /** Shown centred when there is nothing to draw yet. */
  emptyHint?: ReactNode;
  ariaLabel?: string;
  /** A cold→hot color-scale strip under the comb, labelled with these two
   *  words — omitted (as before) when not given, since most Honeycomb
   *  instances (the landing's, a small account panel) don't have the
   *  vertical room a legend needs. */
  legend?: { cold: string; hot: string };
}) {
  // Measures the inner (flex-1) box, not the whole component: when a
  // legend is given it takes a fixed slice of `minHeight` below the comb,
  // so the comb itself must size against what's left, not the full box.
  const [innerRef, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 600, height: minHeight });
  const [hover, setHover] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => b.heat - a.heat || a.id.localeCompare(b.id)), [items]);
  const layout = useMemo(() => layoutRadialHive(sorted.length, W, H, { maxRadius }), [sorted.length, W, H, maxRadius]);
  const steps = HIVE_RAMP.length;
  const focus = selectedId ?? hover;

  // A cell pulses once when its own heat genuinely changed since the last
  // render (a real stage move, not a re-sort of the same data) — the
  // reaction the comb was missing when a deal moves in the CRM. The small
  // ▲/▼ (below) says which way, for as long as this component stays
  // mounted — a real, live delta between two polls, never a persisted
  // "since when" claim the data doesn't back (see intent-hive.tsx's own
  // docstring on why there's no such history to draw from yet).
  const prevHeatRef = useRef<Map<string, number>>(new Map());
  const [pulsing, setPulsing] = useState<ReadonlyMap<string, "up" | "down">>(new Map());
  useEffect(() => {
    const prev = prevHeatRef.current;
    const changed = new Map<string, "up" | "down">();
    for (const item of sorted) {
      const before = prev.get(item.id);
      if (before !== undefined && Math.abs(before - item.heat) > 0.5) changed.set(item.id, item.heat > before ? "up" : "down");
    }
    prevHeatRef.current = new Map(sorted.map((i) => [i.id, i.heat]));
    if (changed.size === 0) return;
    // Deferred a frame, not called synchronously in the effect body — the
    // pulse is genuinely a reaction to an external change, not state React
    // itself needs to keep in sync every render.
    const raf = requestAnimationFrame(() => setPulsing(changed));
    const timer = setTimeout(() => setPulsing(new Map()), 650);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className={cn("bee-fill flex w-full flex-col", className)} style={{ minHeight }}>
        <div ref={innerRef} className="relative grid min-h-0 flex-1 place-items-center">
          <EmptyComb width={Math.min(W, 260)} />
          {emptyHint && <p className="bee-caption absolute bottom-2 text-center">{emptyHint}</p>}
        </div>
        {legend && (
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <span className="bee-micro">{legend.cold}</span>
            <span className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${HIVE_RAMP[HIVE_RAMP.length - 1]}, ${HIVE_RAMP[0]})` }} aria-hidden />
            <span className="bee-micro">{legend.hot}</span>
          </div>
        )}
      </div>
    );
  }

  const hoverIndex = hover !== null && selectedId === null ? sorted.findIndex((s) => s.id === hover) : -1;
  const active = hoverIndex >= 0 ? sorted[hoverIndex] : null;
  const activeCell = hoverIndex >= 0 ? layout.cells[hoverIndex] : null;
  const hexagon = hexagonPath(0, 0, layout.radius - 1);

  return (
    <div className={cn("bee-fill flex w-full flex-col", className)} style={{ minHeight }}>
      <div ref={innerRef} className="relative min-h-0 flex-1">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {layout.ghosts.map((g, i) => (
            <path key={`g${i}`} d={hexagonPath(g.x, g.y, layout.radius - 1)} fill={REST} />
          ))}
          {layout.cells.map((c, i) => {
            const item = sorted[i];
            const fill = HIVE_RAMP[rampIndex(i, c.ring, sorted.length, steps)];
            const isFocus = focus === item.id;
            const move = pulsing.get(item.id);
            const anchor = { x: c.x, y: c.y, radius: layout.radius, width: W, height: H };
            return (
              <g
                key={item.id}
                className={cn("bee-hive-cell", onSelect && "cursor-pointer")}
                style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
                tabIndex={onSelect ? 0 : undefined}
                role={onSelect ? "button" : undefined}
                aria-label={onSelect ? item.label : undefined}
                onMouseEnter={() => setHover(item.id)}
                onFocus={() => setHover(item.id)}
                onClick={onSelect ? () => onSelect(item, anchor) : undefined}
                onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item, anchor); } } : undefined}
              >
                {/* Hovering/focusing one cell never dims the rest of the comb
                    — it just gets a small ink outline, the same one
                    :focus-visible already draws for keyboard focus. A
                    group color (see groupColor above) takes that outline
                    instead, everywhere but the focused cell. */}
                <path
                  className={cn(move && "bee-hive-pulse-path")}
                  d={hexagon}
                  fill={fill}
                  stroke={isFocus ? "var(--color-text)" : (item.groupColor ?? "var(--color-card)")}
                  strokeWidth={isFocus ? 2 : item.groupColor ? 1.5 : 1}
                >
                  <title>{`${item.label}${item.caption ? ` · ${item.caption}` : ""}`}</title>
                </path>
                {item.mark && layout.radius >= 10 && (
                  <circle cx={0} cy={layout.radius * 0.45} r={Math.max(2, layout.radius * 0.16)} fill={item.mark} stroke="var(--color-card)" strokeWidth={1} />
                )}
                {move && layout.radius >= 10 && (
                  <path
                    d={arrowPath(0, -layout.radius * 0.42, Math.max(2, layout.radius * 0.15), move === "up")}
                    fill="var(--color-card)"
                    stroke="var(--color-text)"
                    strokeWidth={1}
                  />
                )}
              </g>
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
      {legend && (
        <div className="mt-2 flex shrink-0 items-center gap-2">
          <span className="bee-micro">{legend.cold}</span>
          <span className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${HIVE_RAMP[HIVE_RAMP.length - 1]}, ${HIVE_RAMP[0]})` }} aria-hidden />
          <span className="bee-micro">{legend.hot}</span>
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
