import { localeTags, defaultLocale, type Locale } from "@/i18n/locales";
import { CLOSED_OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "@/types/domain";

/** Checklist MEDDIC — un criterio por pilar del framework de calificación.
 *  Se guarda como mapa de booleanos (no columnas fijas) para poder ajustar
 *  el set de criterios sin migración; una clave ausente se lee como
 *  "todavía no confirmado", nunca como "descalificado". */
export const MEDDIC_CRITERIA: { key: string; label: string; hint: string }[] = [
  { key: "metric", label: "Métrica", hint: "¿Hay un número de negocio claro que la cuenta quiere mejorar?" },
  { key: "economic_buyer", label: "Comprador económico", hint: "¿Identificamos a quién firma el gasto?" },
  { key: "decision_criteria", label: "Criterios de decisión", hint: "¿Sabemos con qué evalúan las opciones?" },
  { key: "decision_process", label: "Proceso de decisión", hint: "¿Conocemos los pasos y tiempos para decidir?" },
  { key: "identify_pain", label: "Dolor identificado", hint: "¿Confirmamos la urgencia o el dolor real?" },
  { key: "champion", label: "Champion interno", hint: "¿Hay alguien adentro empujando la compra por nosotros?" },
];

/** Fracción 0–1 de criterios MEDDIC confirmados. */
export function qualificationScore(qualification: Record<string, boolean>): number {
  const confirmed = MEDDIC_CRITERIA.filter((c) => qualification[c.key]).length;
  return confirmed / MEDDIC_CRITERIA.length;
}

/** Probabilidad de cierre por etapa — la ponderación del pronóstico.
 *  Reglas de negocio simples y explícitas, no un modelo de ML: cada etapa
 *  del pipeline ya representa cuánto ha avanzado el deal. */
export const STAGE_PROBABILITY: Record<OpportunityStatus, number> = {
  detected: 0.1,
  ready_to_action: 0.25,
  prioritized: 0.4,
  in_progress: 0.6,
  won: 1,
  lost: 0,
  dismissed: 0,
};


// ── Riesgo de deal basado en histórico real ─────────────────────────────────

/** Ancho de cada rango de score para agrupar el histórico — más angosto que
 *  esto y casi ningún rango junta suficientes deals cerrados para ser
 *  confiable; más ancho y deja de distinguir "70 de score" de "89". */
const SCORE_BUCKET_WIDTH = 20;
/** Bajo esta cantidad de deals cerrados en el rango, no hay suficiente
 *  historia para confiar en el porcentaje — se usa la probabilidad fija por
 *  etapa en su lugar. Es la diferencia entre un dato real y uno inventado. */
const MIN_SAMPLE_SIZE = 5;

export interface ScoreBucketStat {
  bucketStart: number; // 0, 20, 40, 60, 80
  won: number;
  lost: number;
  sampleSize: number;
  winRate: number;
}

function scoreBucketStart(score: number): number {
  return Math.min(80, Math.max(0, Math.floor(score / SCORE_BUCKET_WIDTH) * SCORE_BUCKET_WIDTH));
}

/** Tasa de cierre real por rango de score, calculada de los deals ya
 *  cerrados (ganados o perdidos) — el histórico que BEE ya tiene, en vez de
 *  asumir que todo lo que llega a "in_progress" cierra siempre igual. */
export function computeScoreBucketStats(opportunities: Opportunity[]): ScoreBucketStat[] {
  const closed = opportunities.filter((o) => o.status === "won" || o.status === "lost");
  const buckets = new Map<number, { won: number; lost: number }>();

  for (const o of closed) {
    const start = scoreBucketStart(o.score);
    const b = buckets.get(start) ?? { won: 0, lost: 0 };
    if (o.status === "won") b.won += 1;
    else b.lost += 1;
    buckets.set(start, b);
  }

  return [...buckets.entries()]
    .map(([bucketStart, { won, lost }]) => ({
      bucketStart,
      won,
      lost,
      sampleSize: won + lost,
      winRate: won / (won + lost),
    }))
    .sort((a, b) => a.bucketStart - b.bucketStart);
}

/** Probabilidad de cierre para una oportunidad abierta: la tasa real de
 *  cierre de deals históricos con score parecido, cuando hay suficientes
 *  (≥ MIN_SAMPLE_SIZE) — si no, cae de vuelta a STAGE_PROBABILITY en vez de
 *  fingir una precisión que los datos todavía no sostienen. */
export function closeProbability(opportunity: Opportunity, bucketStats: ScoreBucketStat[]): number {
  if (opportunity.status === "won") return 1;
  if (opportunity.status === "lost" || opportunity.status === "dismissed") return 0;

  const start = scoreBucketStart(opportunity.score);
  const stat = bucketStats.find((s) => s.bucketStart === start);
  if (stat && stat.sampleSize >= MIN_SAMPLE_SIZE) return stat.winRate;
  return STAGE_PROBABILITY[opportunity.status];
}

export interface ForecastMonthBucket {
  key: string; // "2026-09" o "sin_fecha"
  label: string;
  weighted: number;
  total: number;
  count: number;
}

export interface AtRiskOpportunity {
  opportunity: Opportunity;
  reason: "sin_fecha_de_cierre" | "fecha_vencida" | "poco_calificada";
}

export interface ForecastSummary {
  /** Suma de amount de todo lo abierto (sin ponderar). */
  pipelineValue: number;
  /** Suma de amount * probabilidad de cierre — el número real del pronóstico. */
  weightedForecast: number;
  openCount: number;
  wonValue: number;
  byMonth: ForecastMonthBucket[];
  atRisk: AtRiskOpportunity[];
  /** Tasas de cierre reales por rango de score — solo los rangos con
   *  suficiente histórico para ser confiables (ver MIN_SAMPLE_SIZE). Vacío
   *  hasta que haya suficientes deals cerrados; hasta entonces el pronóstico
   *  usa la probabilidad fija por etapa. */
  scoreBucketStats: ScoreBucketStat[];
}

function monthLabelFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTags[locale], { month: "short", year: "2-digit" });
}

/** Parsea un "YYYY-MM-DD" como fecha local — `new Date("YYYY-MM-DD")` lo
 *  interpreta como medianoche UTC, y con offsets negativos (América) eso
 *  cae en el día/mes anterior en hora local, corriendo el bucket y el
 *  chequeo de "vencida" un día para atrás. */
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Arma el pronóstico completo a partir de la lista de oportunidades ya
 *  cargada — mismo patrón que el resto de la BI de BEE: todo el cálculo
 *  vive en el cliente, sin endpoint de agregación aparte. `today` se recibe
 *  como parámetro para que el cálculo sea determinista y testeable. */
export function computeForecast(
  opportunities: Opportunity[],
  today: Date,
  locale: Locale = defaultLocale,
): ForecastSummary {
  const monthLabel = monthLabelFormatter(locale);
  const open = opportunities.filter((o) => !CLOSED_OPPORTUNITY_STATUSES.includes(o.status));
  const won = opportunities.filter((o) => o.status === "won");
  const bucketStats = computeScoreBucketStats(opportunities).filter(
    (s) => s.sampleSize >= MIN_SAMPLE_SIZE,
  );

  const pipelineValue = open.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const weightedForecast = open.reduce(
    (sum, o) => sum + (o.amount ?? 0) * closeProbability(o, bucketStats),
    0,
  );
  const wonValue = won.reduce((sum, o) => sum + (o.amount ?? 0), 0);

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const bucketsByKey = new Map<string, ForecastMonthBucket>();

  // Seis meses hacia adelante, para que se vean aunque no tengan deals todavía.
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    bucketsByKey.set(key, { key, label: monthLabel.format(d), weighted: 0, total: 0, count: 0 });
  }
  // Bucket label follows the same locale as the month labels — this used
  // to be Spanish regardless of the UI language.
  const sinFecha: ForecastMonthBucket = {
    key: "sin_fecha",
    label: locale === "en" ? "No date" : "Sin fecha",
    weighted: 0,
    total: 0,
    count: 0,
  };

  const atRisk: AtRiskOpportunity[] = [];

  for (const o of open) {
    const weighted = (o.amount ?? 0) * closeProbability(o, bucketStats);

    if (!o.expected_close_date) {
      sinFecha.weighted += weighted;
      sinFecha.total += o.amount ?? 0;
      sinFecha.count += 1;
      atRisk.push({ opportunity: o, reason: "sin_fecha_de_cierre" });
      continue;
    }

    const closeDate = parseLocalDate(o.expected_close_date);
    if (closeDate < todayStart) {
      atRisk.push({ opportunity: o, reason: "fecha_vencida" });
    } else if (qualificationScore(o.qualification) < 0.5 && o.status !== "detected") {
      atRisk.push({ opportunity: o, reason: "poco_calificada" });
    }

    const key = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = bucketsByKey.get(key);
    if (bucket) {
      bucket.weighted += weighted;
      bucket.total += o.amount ?? 0;
      bucket.count += 1;
    } else {
      sinFecha.weighted += weighted;
      sinFecha.total += o.amount ?? 0;
      sinFecha.count += 1;
    }
  }

  const byMonth = [...bucketsByKey.values()];
  if (sinFecha.count > 0) byMonth.push(sinFecha);

  return {
    pipelineValue,
    weightedForecast,
    openCount: open.length,
    wonValue,
    byMonth,
    atRisk,
    scoreBucketStats: bucketStats,
  };
}
