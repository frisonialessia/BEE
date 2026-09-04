"use client";

import type { CSSProperties, ReactNode } from "react";

import { TONE, tint } from "@/components/charts/palette";
import { cn } from "@/lib/utils";

/**
 * The directory table's small parts — shared by the Directorio and Leads
 * tabs so both read as the same table: a caption-uppercase header row, rows
 * divided by hairlines, a chip for a category (its background carries the
 * hue, the text stays ink), and the lavender initials disc.
 */

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "bee-caption border-b border-[var(--color-divider)] px-3 py-2 font-medium uppercase tracking-wide first:pl-0 last:pr-0",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={cn("px-3 py-2.5 align-middle first:pl-0 last:pr-0", align === "right" ? "text-right" : "text-left", className)}>{children}</td>;
}

/** Row chip: category text on a tinted background — lavender for a neutral
 *  category (a source, a status), honey at 45 % for a signal. */
export function RowChip({ hue = TONE.calm, level, children, className }: { hue?: string; level?: 100 | 70 | 45; children: ReactNode; className?: string }) {
  const style: CSSProperties = { background: level ? tint(hue, level) : hue };
  return (
    <span className={cn("inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-text)]", className)} style={style}>
      {children}
    </span>
  );
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Initials in the quiet lavender disc — the same disc the drawer uses. */
export function InitialsDisc({ name, size = 32, className }: { name: string | null | undefined; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-[var(--color-primary)] font-bold text-[var(--color-text)]", className)}
      style={{ width: size, height: size, fontSize: size >= 32 ? 12 : 10 }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Hairline-divided list row — the `.bee-row` with the click affordance. */
export function ListRow({ children, onClick, className, title }: { children: ReactNode; onClick?: () => void; className?: string; title?: string }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={cn("bee-row w-full text-left transition-colors hover:bg-[var(--color-primary)]/20", className)}>
        {children}
      </button>
    );
  }
  return (
    <div className={cn("bee-row", className)} title={title}>
      {children}
    </div>
  );
}
