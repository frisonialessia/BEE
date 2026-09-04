import { cn } from "@/lib/utils";
import { DATA, SALES, mix } from "@/components/charts/palette";

/** ▲ / ▼ with the number, always. One color per box: the chip wears the
 *  same tone as the tile it sits in — up at full strength, down as a paler
 *  wash of that same tone with ink text (BEE warns, it doesn't punish, and
 *  it never brings a second hue into a box). `tone="sales"` (Ventas page
 *  only) is the green family. */
export function DeltaChip({
  value,
  label,
  tone = DATA.indigo,
  className,
}: {
  /** Fraction (0.32 = +32 %) or null when there is no previous period. */
  value: number | null;
  label?: string;
  /** A palette color (the box's tone) or "sales" for the Ventas greens. */
  tone?: string;
  className?: string;
}) {
  if (value === null || Number.isNaN(value)) return null;
  const up = value >= 0;
  const sales = tone === "sales";
  const base = sales ? SALES.won : tone;
  const background = up ? mix(base, 22) : sales ? SALES.mint : mix(base, 10);
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <span
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-text)]"
        style={{ background }}
      >
        {up ? "▲" : "▼"} {Math.abs(Math.round(value * 100))}%
      </span>
      {label ? <span className="bee-micro truncate">{label}</span> : null}
    </span>
  );
}
