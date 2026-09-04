import { DeltaChip } from "@/components/charts/delta-chip";
import { DATA, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

/**
 * The stat tile that replaces every bare KPI box: a labelled chip, the
 * number, a delta chip, and on the right either an 8-point sparkline or a
 * progress ring. Tone is THE color of the box — chip, delta, sparkline and
 * ring all wear it; a box never mixes two hues.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  progress,
  tone = DATA.indigo,
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
    <div className={cn("bee-bento flex h-full min-w-0 flex-col justify-between gap-2 p-4", className)}>
      <span
        className="inline-flex w-fit max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-text)]"
        style={{ background: mix(tone, 20) }}
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone }} />
        <span className="truncate">{label}</span>
      </span>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-none tracking-tight tabular-nums [overflow-wrap:anywhere] md:text-3xl">{value}</p>
          {delta !== undefined ? (
            <DeltaChip value={delta} label={deltaLabel} tone={salesTone ? "sales" : tone} className="mt-1.5" />
          ) : hint ? (
            <p className="bee-micro mt-1.5 truncate">{hint}</p>
          ) : null}
        </div>
        {progress !== undefined ? (
          <span className="shrink-0"><ProgressRing value={progress} color={tone} size={40} stroke={4} /></span>
        ) : trend && trend.length >= 2 ? (
          <span className="hidden shrink-0 sm:inline" style={{ color: tone }}>
            <Sparkline values={trend} width={72} height={24} formatValue={formatValue} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A row of StatTiles: two per row on phones, `cols` from tablet up. */
export function StatStrip({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return <div className={cn("grid grid-cols-2 gap-4", grid)}>{children}</div>;
}
