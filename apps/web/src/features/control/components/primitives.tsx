"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { REST, tint, type Intensity } from "@/components/charts/palette";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The marks every operations box is built from. A state is never a color
 * on text or an icon: it is a dot at one intensity of the box's hue (100 =
 * fine, 70 / 45 = less so, REST = off) next to the word that says it. The
 * meter and the chip take the same hue, so a box never mixes two colors.
 */

export type DotLevel = Intensity | "rest";

export function dotColor(hue: string, level: DotLevel): string {
  return level === "rest" ? REST : tint(hue, level);
}

/** Dot + word. The dot keeps a hairline so REST stays visible on white. */
export function StateWord({ hue, level, className, title, children }: { hue: string; level: DotLevel; className?: string; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cn("inline-flex min-w-0 shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--color-text)]", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: dotColor(hue, level), boxShadow: "inset 0 0 0 1px var(--color-divider)" }} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Filled chip with a dot — the StatTile label recipe, in a row or a card. */
export function StateChip({ hue, level, className, title, children }: { hue: string; level: DotLevel; className?: string; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={cn("inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-text)]", className)}
      style={{ background: dotColor(hue, level) }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: level === "rest" ? "var(--color-text-muted)" : hue }} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Thin 0–1 meter: the hue on a faint track of the same hue. */
export function Meter({ value, hue, color, className }: { value: number; hue: string; /** Fill override (an intensity of the hue). */ color?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full", className)} style={{ background: REST }} aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: color ?? hue }} />
    </span>
  );
}

/** Loading rows, the shape of the list they stand in for. */
export function RowsSkeleton({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="rounded-[var(--radius-md)]" style={{ height }} />
      ))}
    </div>
  );
}

/** One-line honest empty state, centred in the box. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="bee-caption flex flex-1 items-center justify-center py-8 text-center">{children}</p>;
}

/**
 * A list that shows only the rows that fit its box (use-row-capacity) and
 * a quiet "Ver todo" when there are more. `rowHeight` is the CSS pixels
 * one row takes — keep it in sync with the row markup.
 */
export function useFittedRows<T>(items: T[], rowHeight: number, { min = 3, max = 40 } = {}) {
  const [ref, capacity] = useRowCapacity<HTMLUListElement>(rowHeight, 0, { min, max });
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? items : items.slice(0, capacity);
  const hidden = Math.max(0, items.length - rows.length);
  return [ref, rows, { hidden, expanded, toggle: () => setExpanded((v) => !v) }] as const;
}

export function ViewAllButton({ hidden, expanded, onToggle }: { hidden: number; expanded: boolean; onToggle: () => void }) {
  const t = useTranslations("probarNetworkBrandControl.control.common");
  if (hidden === 0 && !expanded) return null;
  return (
    <button type="button" onClick={onToggle} className="bee-btn-text mt-2 self-start text-xs">
      {expanded ? t("viewLess") : t("viewAll", { count: hidden })}
    </button>
  );
}
