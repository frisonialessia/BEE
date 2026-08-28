import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DailySignalPoint } from "@/lib/signal-trends";

/** Volumen de señales por día — barra total con la porción de alta
 *  intención (score ≥ 75) resaltada encima, mismo patrón visual que
 *  ForecastBarChart (total tenue + porción destacada). Sin librería de
 *  gráficas, tooltip real (Radix) por barra. */
export function SignalVolumeChart({ points }: { points: DailySignalPoint[] }) {
  const anyData = points.some((p) => p.count > 0);
  if (!anyData) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Sin señales todavía en esta ventana de tiempo.
      </p>
    );
  }

  const maxCount = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 110 }}>
      {points.map((p) => {
        const totalPct = (p.count / maxCount) * 100;
        const hotPct = (p.hotCount / maxCount) * 100;
        return (
          <div key={p.key} className="flex w-8 shrink-0 flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/20">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)]/50 transition-[height] duration-300"
                    style={{ height: `${Math.max(totalPct, p.count > 0 ? 4 : 0)}%` }}
                  />
                  <div
                    className="absolute bottom-0 w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-1)] transition-[height] duration-300"
                    style={{ height: `${Math.max(hotPct, p.hotCount > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {p.label}: {p.count} señal{p.count === 1 ? "" : "es"}
                {p.hotCount > 0 ? `, ${p.hotCount} de alta intención` : ""}
              </TooltipContent>
            </Tooltip>
            <p className="text-[10px] text-muted-foreground">{p.label.split(" ")[0]}</p>
          </div>
        );
      })}
    </div>
  );
}
