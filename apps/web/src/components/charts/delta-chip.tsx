import { cn } from "@/lib/utils";
import { DATA, mix } from "@/components/charts/palette";

/** ▲ / ▼ with the number, always. Up is indigo, down is honey — BEE warns,
 *  it doesn't punish. `tone="sales"` (Ventas page only) paints up green. */
export function DeltaChip({
  value,
  label,
  tone = "default",
  className,
}: {
  /** Fraction (0.32 = +32 %) or null when there is no previous period. */
  value: number | null;
  label?: string;
  tone?: "default" | "sales";
  className?: string;
}) {
  if (value === null || Number.isNaN(value)) return null;
  const up = value >= 0;
  const color = up ? (tone === "sales" ? "#2f8f4e" : DATA.indigo) : DATA.honey;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <span
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
        style={{ background: mix(up ? (tone === "sales" ? "#52c871" : DATA.indigo) : DATA.honey, 18), color }}
      >
        {up ? "▲" : "▼"} {Math.abs(Math.round(value * 100))}%
      </span>
      {label ? <span className="bee-micro truncate">{label}</span> : null}
    </span>
  );
}
