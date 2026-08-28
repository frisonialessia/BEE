import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MeddicBucketStat } from "@/lib/win-loss";

/** ¿Calificar más de verdad se traduce en más cierres ganados? Tasa de
 *  cierre real por nivel de calificación MEDDIC, no una suposición —
 *  mismo patrón visual que TrendsChart (barra + tasa arriba), con un
 *  tooltip real (Radix) en vez del title nativo del navegador. */
export function MeddicCorrelationChart({ stats }: { stats: MeddicBucketStat[] }) {
  const anyData = stats.some((s) => s.won + s.lost > 0);
  if (!anyData) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Todavía no hay suficientes deals cerrados con calificación MEDDIC.
      </p>
    );
  }

  const maxTotal = Math.max(1, ...stats.map((s) => s.won + s.lost));

  return (
    <div className="flex items-end gap-4" style={{ height: 150 }}>
      {stats.map((s) => {
        const total = s.won + s.lost;
        const pct = (total / maxTotal) * 100;
        return (
          <div key={s.bucketLabel} className="flex flex-1 flex-col items-center gap-1.5">
            <p className="h-4 text-[11px] font-medium text-muted-foreground">
              {s.winRate !== null ? `${Math.round(s.winRate * 100)}%` : "—"}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)] transition-[height] duration-300"
                    style={{ height: `${Math.max(pct, total > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {s.bucketLabel}: {s.won} ganadas, {s.lost} perdidas
              </TooltipContent>
            </Tooltip>
            <p className="text-[11px] font-medium text-muted-foreground">{s.bucketLabel}</p>
          </div>
        );
      })}
    </div>
  );
}
