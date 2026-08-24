import type { Opportunity, Signal } from "@/types/domain";

const DAY_MS = 86_400_000;
const MIN_SAMPLE_FOR_WIN_RATE = 5;

export interface TodayImpact {
  /** Señales de alta intención detectadas en las últimas 24h. */
  hotSignalsToday: Signal[];
  /** null hasta que haya ≥5 deals cerrados — nunca una tasa inventada. */
  winRate: number | null;
  winRateSampleSize: number;
  /** null hasta que alguna oportunidad tenga `amount` cargado. */
  avgDealValue: number | null;
  /** Solo se calcula cuando winRate Y avgDealValue son reales. */
  projectedUplift: number | null;
}

/** El "qué pasa si actúas hoy" — nunca inventa una tasa de cierre ni un
 *  valor de deal: ambos deben venir de datos reales ya cargados (mismo
 *  patrón que el resto de BEE) o el resultado se degrada a solo un conteo
 *  de señales, sin cifra en dólares. */
export function computeTodayImpact(
  signals: Signal[],
  opportunities: Opportunity[],
  today: Date,
): TodayImpact {
  const hotSignalsToday = signals.filter(
    (s) => s.score >= 75 && today.getTime() - new Date(s.detected_at).getTime() <= DAY_MS,
  );

  const closed = opportunities.filter((o) => o.status === "won" || o.status === "lost");
  const won = closed.filter((o) => o.status === "won");
  const winRateSampleSize = closed.length;
  const winRate = winRateSampleSize >= MIN_SAMPLE_FOR_WIN_RATE ? won.length / winRateSampleSize : null;

  const dealsWithAmount = opportunities.filter((o) => o.amount !== null && o.amount > 0);
  const avgDealValue =
    dealsWithAmount.length > 0
      ? dealsWithAmount.reduce((sum, o) => sum + (o.amount ?? 0), 0) / dealsWithAmount.length
      : null;

  const projectedUplift =
    winRate !== null && avgDealValue !== null
      ? hotSignalsToday.length * winRate * avgDealValue
      : null;

  return { hotSignalsToday, winRate, winRateSampleSize, avgDealValue, projectedUplift };
}
