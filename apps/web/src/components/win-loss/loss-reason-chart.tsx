import { lossReasonLabels } from "@/lib/format";
import type { LossReasonStat } from "@/lib/win-loss";

/** Barras horizontales rankeadas por frecuencia — la razón más común de
 *  pérdida arriba. Sin librería de gráficas, como el resto de la BI de BEE. */
export function LossReasonChart({ stats }: { stats: LossReasonStat[] }) {
  if (stats.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Todavía no hay deals perdidos con razón registrada.
      </p>
    );
  }

  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div className="space-y-2.5">
      {stats.map((s) => (
        <div key={s.reason} className="flex items-center gap-3">
          <p className="w-40 shrink-0 truncate text-xs text-muted-foreground">
            {s.reason === "unspecified" ? "Sin razón registrada" : lossReasonLabels[s.reason]}
          </p>
          <div className="relative h-5 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-primary)]/20">
            <div
              className="h-full rounded-[var(--radius-sm)] bg-[var(--color-chart-2)]/70"
              style={{ width: `${Math.max((s.count / maxCount) * 100, 4)}%` }}
            />
          </div>
          <p className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {s.count} · {Math.round(s.fraction * 100)}%
          </p>
        </div>
      ))}
    </div>
  );
}
