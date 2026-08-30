import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ForecastMonthBucket } from "@/lib/forecast";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Barras de pronóstico ponderado por mes — sin librería de gráficas, como
 *  el resto de la BI de BEE. Cada barra muestra el total del pipeline en un
 *  tono tenue y, encima, la porción ponderada por probabilidad de cierre.
 *  El tooltip es real (Radix), no el title nativo del navegador. */
export function ForecastBarChart({ buckets }: { buckets: ForecastMonthBucket[] }) {
  const maxValue = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: 160 }}>
      {buckets.map((b) => {
        const totalPct = (b.total / maxValue) * 100;
        const weightedPct = (b.weighted / maxValue) * 100;
        return (
          <div key={b.key} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)] transition-[height]"
                    style={{ height: `${Math.max(totalPct, 2)}%` }}
                  />
                  <div
                    className="absolute bottom-0 w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-2)] transition-[height]"
                    style={{ height: `${Math.max(weightedPct, b.weighted > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {b.label}: {currency.format(b.weighted)} ponderado de {currency.format(b.total)} en pipeline (
                {b.count} oportunidad{b.count === 1 ? "" : "es"})
              </TooltipContent>
            </Tooltip>
            <p className="bee-micro font-medium">{b.label}</p>
          </div>
        );
      })}
      <div className="ml-2 flex shrink-0 flex-col justify-end gap-1.5 pb-4 bee-micro">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[var(--color-chart-2)]" /> Ponderado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[var(--color-chart-4)]" /> Pipeline total
        </span>
      </div>
    </div>
  );
}
