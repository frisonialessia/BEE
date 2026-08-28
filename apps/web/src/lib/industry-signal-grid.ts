/**
 * Cross-tab: industria de la empresa × tipo de señal que originó el deal,
 * con la tasa de cierre de cada combinación — alimenta el heatmap
 * hexagonal de Resumen (components/dashboard/industry-signal-heatmap.tsx).
 *
 * Esto no vive en ninguna otra página: Ganado/Perdido tiene motivo de
 * pérdida y competidor, Señales tiene volumen por tipo, pero ninguna
 * cruza industria contra tipo de señal — es la respuesta visual a "¿en
 * qué tipo de cuenta soy más fuerte?", y solo tiene sentido combinando
 * datos que hoy viven en dos secciones distintas.
 */
import type { Company, Opportunity, Signal, SignalType } from "@/types/domain";

export interface IndustrySignalCell {
  industry: string;
  signalType: SignalType;
  closedCount: number;
  wonCount: number;
  winRate: number; // 0–1
}

const CLOSED = new Set(["won", "lost"]);

/** Solo deals CERRADOS (ganados o perdidos) cuentan — igual que el
 * predictor de ciclo, la tasa de cierre de un deal todavía abierto no
 * existe aún, no es honesto tratarlo como 0%.
 *
 * Usa `companies` (Opportunity.company_id → Company.industry), no
 * battlecards: los battlecards en lote solo cubren oportunidades
 * "listas para acción" (ver fetchBattlecards en lib/api/opportunities.ts),
 * lo que dejaría fuera casi todo lo ya cerrado — justo lo que este mapa
 * necesita. */
export function computeIndustrySignalGrid(
  opportunities: Opportunity[],
  signals: Signal[],
  companies: Company[],
): IndustrySignalCell[] {
  const signalById = new Map(signals.map((s) => [s.id, s]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const grouped = new Map<string, { industry: string; signalType: SignalType; closed: number; won: number }>();
  for (const o of opportunities) {
    if (!CLOSED.has(o.status)) continue;
    const signal = o.signal_id ? signalById.get(o.signal_id) : undefined;
    const industry = o.company_id ? companyById.get(o.company_id)?.industry : null;
    if (!signal || !industry) continue;

    const key = `${industry}::${signal.signal_type}`;
    const entry = grouped.get(key) ?? { industry, signalType: signal.signal_type, closed: 0, won: 0 };
    entry.closed += 1;
    if (o.status === "won") entry.won += 1;
    grouped.set(key, entry);
  }

  return [...grouped.values()].map((e) => ({
    industry: e.industry,
    signalType: e.signalType,
    closedCount: e.closed,
    wonCount: e.won,
    winRate: e.won / e.closed,
  }));
}
