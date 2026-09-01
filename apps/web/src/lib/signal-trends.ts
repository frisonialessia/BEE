import { localeTags, defaultLocale, type Locale } from "@/i18n/locales";
import type { Signal } from "@/types/domain";

export interface DailySignalPoint {
  key: string; // "2026-08-21"
  label: string;
  count: number;
  hotCount: number;
}

function dayLabelFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTags[locale], { day: "2-digit", month: "short" });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Volumen de señales por día — cuántas llegaron y cuántas fueron de alta
 *  intención (score ≥ 75), calculado directo de `detected_at`. Mismo patrón
 *  que computeMonthlyTrends en lib/trends.ts, día en vez de mes: rellena
 *  todos los días de la ventana en 0 primero (para que un día sin señales
 *  se vea como una barra vacía, no como un hueco en el eje). */
export function computeDailySignalVolume(
  signals: Signal[],
  today: Date,
  daysBack = 14,
  locale: Locale = defaultLocale,
): DailySignalPoint[] {
  const dayLabel = dayLabelFormatter(locale);
  const points = new Map<string, DailySignalPoint>();
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    points.set(key, { key, label: dayLabel.format(d), count: 0, hotCount: 0 });
  }

  for (const s of signals) {
    const t = new Date(s.detected_at);
    if (Number.isNaN(t.getTime())) continue;
    const point = points.get(dayKey(t));
    if (!point) continue; // fuera de la ventana — señal más vieja que daysBack
    point.count += 1;
    if (s.score >= 75) point.hotCount += 1;
  }

  return [...points.values()];
}
