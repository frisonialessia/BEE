import { localeTags, defaultLocale, type Locale } from "@/i18n/locales";
import type { Opportunity } from "@/types/domain";

export interface MonthlyTrendPoint {
  key: string; // "2026-07"
  label: string;
  created: number;
  won: number;
  lost: number;
  /** null cuando no se cerró nada ese mes — no hay tasa que mostrar, y un 0%
   *  se leería como "perdimos todo" en vez de "no hubo cierres". */
  winRate: number | null;
}

function monthLabelFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTags[locale], { month: "short", year: "2-digit" });
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Conversión por etapa en el tiempo: cuántas oportunidades se crearon,
 *  ganaron o perdieron cada mes, y la tasa de cierre resultante — en vez de
 *  solo la foto de "ahora mismo" que ya muestran el Resumen y Pronóstico.
 *  Usa `closed_at` (fecha real en que se registró el desenlace); para deals
 *  cerrados antes de que ese campo existiera, cae de vuelta a `updated_at`
 *  como aproximación — la migración ya rellenó `closed_at` para todo lo
 *  histórico, así que esto solo importa para filas muy viejas sin backfill. */
export function computeMonthlyTrends(
  opportunities: Opportunity[],
  today: Date,
  monthsBack = 6,
  locale: Locale = defaultLocale,
): MonthlyTrendPoint[] {
  const monthLabel = monthLabelFormatter(locale);
  const points = new Map<string, MonthlyTrendPoint>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = monthKey(d);
    points.set(key, { key, label: monthLabel.format(d), created: 0, won: 0, lost: 0, winRate: null });
  }

  for (const o of opportunities) {
    const createdKey = monthKey(new Date(o.created_at));
    const createdPoint = points.get(createdKey);
    if (createdPoint) createdPoint.created += 1;

    if (o.status === "won" || o.status === "lost") {
      const closedKey = monthKey(new Date(o.closed_at ?? o.updated_at));
      const closedPoint = points.get(closedKey);
      if (closedPoint) {
        if (o.status === "won") closedPoint.won += 1;
        else closedPoint.lost += 1;
      }
    }
  }

  for (const p of points.values()) {
    const closedTotal = p.won + p.lost;
    p.winRate = closedTotal > 0 ? p.won / closedTotal : null;
  }

  return [...points.values()];
}
