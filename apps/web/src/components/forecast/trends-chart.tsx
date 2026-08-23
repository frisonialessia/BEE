import type { MonthlyTrendPoint } from "@/lib/trends";

/** Creadas vs. tasa de cierre mes a mes — sin librería de gráficas, como el
 *  resto de la BI de BEE. La barra es el volumen creado; el número arriba es
 *  la tasa de cierre de lo que se resolvió ese mes (gana / (gana + pierde)),
 *  no de lo creado — un mes puede crear mucho y cerrar poco, son cosas
 *  distintas y mezclarlas sería engañoso. */
export function TrendsChart({ points }: { points: MonthlyTrendPoint[] }) {
  const maxCreated = Math.max(1, ...points.map((p) => p.created));

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: 170 }}>
      {points.map((p) => {
        const pct = (p.created / maxCreated) * 100;
        return (
          <div key={p.key} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <p className="h-4 text-[10px] font-medium text-muted-foreground">
              {p.winRate !== null ? `${Math.round(p.winRate * 100)}%` : "—"}
            </p>
            <div
              className="relative flex w-full flex-1 items-end justify-center rounded-t-[var(--radius-sm)] bg-[var(--color-primary)]/40"
              title={`${p.label}: ${p.created} creadas, ${p.won} ganadas, ${p.lost} perdidas`}
            >
              <div
                className="w-full rounded-t-[var(--radius-sm)] bg-[var(--color-chart-4)]"
                style={{ height: `${Math.max(pct, p.created > 0 ? 4 : 0)}%` }}
              />
            </div>
            <p className="text-[10px] font-medium text-muted-foreground">{p.label}</p>
          </div>
        );
      })}
    </div>
  );
}
