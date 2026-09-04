import { DeltaChip } from "@/components/charts/delta-chip";
import { TONE, tint } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

/**
 * The KPI tile: a labelled chip, the big number, one minimal trend (a
 * delta chip, or a hint), and on the right an eight-point sparkline or a
 * progress ring. One hue per tile — chip, delta, sparkline and ring all
 * wear it at 45 / 100 % — and the number is always ink. A strip carries
 * four tiles, each in its own hue, so the four read as four questions.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  progress,
  tone = TONE.market,
  salesTone = false,
  formatValue,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaLabel?: string;
  trend?: number[];
  /** 0–1: renders a ring instead of the sparkline. */
  progress?: number;
  tone?: string;
  /** Ventas page only — green up-deltas. */
  salesTone?: boolean;
  formatValue?: (v: number) => string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("bee-tile", className)}>
      <span className="bee-tile__chip" style={{ background: tint(tone, 45) }}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone }} />
        <span className="truncate">{label}</span>
      </span>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="bee-tile__value">{value}</p>
          {delta !== undefined ? (
            <DeltaChip value={delta} label={deltaLabel} tone={salesTone ? "sales" : tone} className="mt-2" />
          ) : hint ? (
            <p className="bee-caption mt-2 truncate">{hint}</p>
          ) : null}
        </div>
        {progress !== undefined ? (
          <span className="shrink-0">
            <ProgressRing value={progress} color={tone} size={44} stroke={4} />
          </span>
        ) : trend && trend.length >= 2 ? (
          <span className="hidden shrink-0 sm:inline" style={{ color: tone }}>
            <Sparkline values={trend} width={76} height={26} formatValue={formatValue} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A row of StatTiles: two per row on phones, `cols` from tablet up. */
export function StatStrip({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return <div className={cn("bee-strip grid grid-cols-2", grid)}>{children}</div>;
}
