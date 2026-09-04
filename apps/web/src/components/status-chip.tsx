import type { LucideIcon } from "lucide-react";

import { DATA, mix } from "@/components/charts/palette";
import { cn } from "@/lib/utils";

/**
 * How BEE says "state" without red or green: OK is indigo, something that
 * wants attention is honey, something that failed is magenta, and anything
 * neutral (simulated, informational, resolved long ago) is muted ink. Each
 * state always carries an icon and a word — color alone never tells the
 * story, so the chip reads the same for everyone.
 */
export type StatusTone = "ok" | "attention" | "failed" | "neutral";

export const STATUS_COLOR: Record<StatusTone, string> = {
  ok: DATA.indigo,
  attention: DATA.honey,
  failed: DATA.magenta,
  neutral: DATA.muted,
};

export function StatusChip({
  tone,
  icon: Icon,
  label,
  className,
  title,
}: {
  tone: StatusTone;
  icon: LucideIcon;
  label: string;
  className?: string;
  /** Plain-words explanation shown on hover. */
  title?: string;
}) {
  const color = STATUS_COLOR[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-text)]",
        className,
      )}
      style={{ background: mix(color, tone === "neutral" ? 14 : 24) }}
    >
      <Icon className="size-3 shrink-0" style={{ color: tone === "neutral" ? "var(--color-text-muted)" : color }} strokeWidth={2.25} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Dot + word — the row-level version of the chip, for lists where a
 *  filled chip on every line would be too heavy. */
export function StatusWord({
  tone,
  icon: Icon,
  label,
  className,
  title,
}: {
  tone: StatusTone;
  icon: LucideIcon;
  label: string;
  className?: string;
  title?: string;
}) {
  const color = STATUS_COLOR[tone];
  return (
    <span title={title} className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs font-medium", className)}>
      <Icon className="size-3.5 shrink-0" style={{ color: tone === "neutral" ? "var(--color-text-muted)" : color }} strokeWidth={2.25} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
