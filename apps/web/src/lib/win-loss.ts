import { qualificationScore } from "@/lib/forecast";
import type { LossReason, Opportunity } from "@/types/domain";

export interface LossReasonStat {
  reason: LossReason | "unspecified";
  count: number;
  /** Fracción de lo perdido (0–1) que corresponde a esta razón. */
  fraction: number;
  /** Suma de amount de los deals perdidos por esta razón. */
  value: number;
}

export interface CompetitorStat {
  competitor: string;
  wins: number;
  losses: number;
}

export interface MeddicBucketStat {
  bucketLabel: string;
  won: number;
  lost: number;
  winRate: number | null;
}

export interface WinLossSummary {
  totalClosed: number;
  won: number;
  lost: number;
  /** null cuando no hay nada cerrado todavía — no hay tasa que mostrar. */
  winRate: number | null;
  wonValue: number;
  lostValue: number;
  /** null cuando ningún deal ganado/perdido tiene closed_at (deals cerrados
   *  antes de que este campo existiera, sin backfill posible). */
  avgDaysToCloseWon: number | null;
  avgDaysToCloseLost: number | null;
  reasonBreakdown: LossReasonStat[];
  competitorBreakdown: CompetitorStat[];
  meddicCorrelation: MeddicBucketStat[];
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const MEDDIC_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0–33%", min: 0, max: 1 / 3 },
  { label: "34–66%", min: 1 / 3, max: 2 / 3 },
  { label: "67–100%", min: 2 / 3, max: 1.001 },
];

/** Ganado/Perdido: por qué se ganan y se pierden los deals, no solo cuántos.
 *  Mismo patrón que el resto de la BI de BEE — todo calculado en el cliente
 *  a partir de la lista de oportunidades ya cargada, sin endpoint aparte. */
export function computeWinLoss(opportunities: Opportunity[]): WinLossSummary {
  const won = opportunities.filter((o) => o.status === "won");
  const lost = opportunities.filter((o) => o.status === "lost");
  const totalClosed = won.length + lost.length;

  const wonValue = won.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const lostValue = lost.reduce((sum, o) => sum + (o.amount ?? 0), 0);

  const avgDaysToCloseWon = average(
    won.filter((o) => o.closed_at).map((o) => daysBetween(o.created_at, o.closed_at as string)),
  );
  const avgDaysToCloseLost = average(
    lost.filter((o) => o.closed_at).map((o) => daysBetween(o.created_at, o.closed_at as string)),
  );

  // ── Razones de pérdida ──────────────────────────────────────────────────
  const reasonCounts = new Map<string, { count: number; value: number }>();
  for (const o of lost) {
    const key = o.loss_reason ?? "unspecified";
    const entry = reasonCounts.get(key) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += o.amount ?? 0;
    reasonCounts.set(key, entry);
  }
  const reasonBreakdown: LossReasonStat[] = [...reasonCounts.entries()]
    .map(([reason, { count, value }]) => ({
      reason: reason as LossReason | "unspecified",
      count,
      fraction: lost.length > 0 ? count / lost.length : 0,
      value,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Competidores mencionados (ganados contra / perdidos ante) ───────────
  const competitorStats = new Map<string, { wins: number; losses: number }>();
  for (const o of won) {
    if (!o.competitor) continue;
    const entry = competitorStats.get(o.competitor) ?? { wins: 0, losses: 0 };
    entry.wins += 1;
    competitorStats.set(o.competitor, entry);
  }
  for (const o of lost) {
    if (!o.competitor) continue;
    const entry = competitorStats.get(o.competitor) ?? { wins: 0, losses: 0 };
    entry.losses += 1;
    competitorStats.set(o.competitor, entry);
  }
  const competitorBreakdown: CompetitorStat[] = [...competitorStats.entries()]
    .map(([competitor, { wins, losses }]) => ({ competitor, wins, losses }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));

  // ── ¿La calificación MEDDIC realmente predice el cierre? ────────────────
  const closed = [...won, ...lost];
  const meddicCorrelation: MeddicBucketStat[] = MEDDIC_BUCKETS.map((b) => {
    const inBucket = closed.filter((o) => {
      const s = qualificationScore(o.qualification);
      return s >= b.min && s < b.max;
    });
    const w = inBucket.filter((o) => o.status === "won").length;
    const l = inBucket.filter((o) => o.status === "lost").length;
    return { bucketLabel: b.label, won: w, lost: l, winRate: w + l > 0 ? w / (w + l) : null };
  });

  return {
    totalClosed,
    won: won.length,
    lost: lost.length,
    winRate: totalClosed > 0 ? won.length / totalClosed : null,
    wonValue,
    lostValue,
    avgDaysToCloseWon,
    avgDaysToCloseLost,
    reasonBreakdown,
    competitorBreakdown,
    meddicCorrelation,
  };
}
