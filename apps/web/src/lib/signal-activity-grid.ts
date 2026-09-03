/**
 * Cuándo llega el mercado — día de la semana × hora, contando
 * `Signal.detected_at`. Dato que ya existe (nunca se usó así): útil para
 * decidir cuándo tener al equipo activo, no solo cuántas señales hay en
 * total. Alimenta el heatmap de actividad de Resumen.
 */
import type { Signal } from "@/types/domain";

import { defaultLocale, localeTags, type Locale } from "@/i18n/locales";

/** Short weekday labels, Monday-first, in the UI language — was a fixed
 *  Spanish array regardless of locale. 2024-01-01 is a Monday. */
export function getDayLabels(locale: Locale = defaultLocale): string[] {
  const fmt = new Intl.DateTimeFormat(localeTags[locale], { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => {
    const label = fmt.format(new Date(2024, 0, 1 + i)).replace(/\.$/, "");
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}

export interface ActivityCell {
  day: number; // 0 = lunes .. 6 = domingo
  hour: number; // 0-23, hora local del navegador
  count: number;
}

/** Grilla completa 7×24 (168 celdas), incluyendo las que están en 0 — el
 * caller decide cómo pintar el vacío, honestamente, en vez de omitir la
 * celda y que parezca que no existe esa combinación. */
export function computeActivityGrid(signals: Signal[]): ActivityCell[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    const d = new Date(s.detected_at);
    if (Number.isNaN(d.getTime())) continue;
    const day = (d.getDay() + 6) % 7; // JS: 0=domingo → reindexa a 0=lunes
    const hour = d.getHours();
    const key = `${day}:${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: ActivityCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, count: counts.get(`${day}:${hour}`) ?? 0 });
    }
  }
  return cells;
}

/** La celda con más señales — null si la grilla está toda en 0. Alimenta
 * el renglón de insight bajo el heatmap ("Pico de actividad: ..."). */
export function mostActiveCell(cells: ActivityCell[]): ActivityCell | null {
  let best: ActivityCell | null = null;
  for (const c of cells) {
    if (c.count > 0 && (!best || c.count > best.count)) best = c;
  }
  return best;
}
