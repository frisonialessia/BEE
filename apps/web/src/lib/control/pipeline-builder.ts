import type { Opportunity, Signal } from "@/types/domain";
import type {
  ExternalProviderName,
  IngestionWorkerStatus,
  SignalPipelineEvent,
  SignalPipelineStage,
} from "@/types/control";

const STAGE_ORDER: Record<SignalPipelineStage, number> = {
  webhook: 0,
  ingestion: 1,
  enrichment: 2,
  strategy: 3,
  ready: 4,
};

function offsetIso(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function isBattlecardComplete(strategy: Opportunity["strategy"]): boolean {
  return Boolean(
    strategy?.pain_point &&
      strategy?.closing_argument &&
      typeof strategy.timing_window === "object",
  );
}

function inferProvider(signal: Signal): ExternalProviderName | null {
  if (signal.source === "webhook") return "linkedin";
  const tags = signal.analysis?.tags;
  if (Array.isArray(tags) && tags.some((t) => String(t).includes("g2"))) return "g2";
  return null;
}

function buildEventsForPair(signal: Signal, opportunity: Opportunity | undefined): SignalPipelineEvent[] {
  const events: SignalPipelineEvent[] = [];
  const baseTs = signal.detected_at;
  const provider = inferProvider(signal);

  events.push({
    id: `${signal.id}-webhook`,
    signal_id: signal.id,
    opportunity_id: opportunity?.id ?? null,
    stage: "webhook",
    title: signal.title,
    provider,
    score: signal.score,
    timestamp: baseTs,
    label: signal.source === "webhook" ? "Webhook recibido" : "Señal capturada",
  });

  if (!opportunity) return events;

  events.push({
    id: `${signal.id}-ingestion`,
    signal_id: signal.id,
    opportunity_id: opportunity.id,
    stage: "ingestion",
    title: signal.title,
    provider: null,
    score: signal.score,
    timestamp: offsetIso(baseTs, 1),
    label: "IngestionWorker · analizadores aplicados",
  });

  const strategy = opportunity.strategy;
  const complete = isBattlecardComplete(strategy);
  const needsEnrichment =
    !complete &&
    (opportunity.status === "detected" || !strategy?.pain_point);

  if (needsEnrichment) {
    events.push({
      id: `${signal.id}-enrichment`,
      signal_id: signal.id,
      opportunity_id: opportunity.id,
      stage: "enrichment",
      title: signal.title,
      provider: provider ?? "linkedin",
      score: signal.score,
      timestamp: offsetIso(baseTs, 2),
      label: "Enriquecimiento externo · LinkedIn / G2",
    });
  } else if (strategy?.playbook || complete) {
    events.push({
      id: `${signal.id}-enrichment-done`,
      signal_id: signal.id,
      opportunity_id: opportunity.id,
      stage: "enrichment",
      title: signal.title,
      provider: provider ?? "linkedin",
      score: signal.score,
      timestamp: offsetIso(baseTs, 3),
      label: "EnrichmentContext aplicado",
    });
  }

  if (strategy?.pain_point || strategy?.playbook || strategy?.generator) {
    const generatedAt =
      typeof strategy.generated_at === "string" ? strategy.generated_at : offsetIso(baseTs, 4);
    events.push({
      id: `${signal.id}-strategy`,
      signal_id: signal.id,
      opportunity_id: opportunity.id,
      stage: "strategy",
      title: signal.title,
      provider: null,
      score: opportunity.score,
      timestamp: generatedAt,
      label: `Estrategia · ${String(strategy.generator ?? "rule_based")}`,
    });
  }

  if (opportunity.status === "ready_to_action" && complete) {
    const readyTs =
      typeof strategy?.generated_at === "string" ? strategy.generated_at : offsetIso(baseTs, 5);
    events.push({
      id: `${signal.id}-ready`,
      signal_id: signal.id,
      opportunity_id: opportunity.id,
      stage: "ready",
      title: signal.title,
      provider: null,
      score: opportunity.score,
      timestamp: readyTs,
      label: "Estrategia de cierre lista",
    });
  }

  return events;
}

/** Synthetic pulse when the worker queue has pending tasks. */
function workerPulseEvent(worker: IngestionWorkerStatus): SignalPipelineEvent | null {
  if (!worker.running || worker.queue_depth <= 0) return null;
  return {
    id: `worker-pulse-${worker.processed_count}`,
    signal_id: null,
    opportunity_id: null,
    stage: "ingestion",
    title: `${worker.queue_depth} tarea${worker.queue_depth === 1 ? "" : "s"} en cola`,
    provider: null,
    score: null,
    timestamp: new Date().toISOString(),
    label: "IngestionWorker procesando",
  };
}

export interface SignalStreamSnapshot {
  events: SignalPipelineEvent[];
  live: boolean;
  ready_count: number;
  fetched_at: string;
}

/** Build a chronological pipeline feed from signals + opportunities + worker state. */
export function buildSignalPipelineEvents(
  signals: Signal[],
  opportunities: Opportunity[],
  worker?: IngestionWorkerStatus,
): SignalPipelineEvent[] {
  const oppBySignal = new Map<string, Opportunity>();
  for (const opp of opportunities) {
    if (opp.signal_id) oppBySignal.set(opp.signal_id, opp);
  }

  const events: SignalPipelineEvent[] = [];
  for (const signal of signals) {
    events.push(...buildEventsForPair(signal, oppBySignal.get(signal.id)));
  }

  const pulse = worker ? workerPulseEvent(worker) : null;
  if (pulse) events.unshift(pulse);

  return events.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
      STAGE_ORDER[b.stage] - STAGE_ORDER[a.stage],
  );
}

export function countReadyEvents(events: SignalPipelineEvent[]): number {
  return events.filter((e) => e.stage === "ready").length;
}

export function findNewReadyEvents(
  events: SignalPipelineEvent[],
  seenIds: Set<string>,
): SignalPipelineEvent[] {
  return events.filter((e) => e.stage === "ready" && !seenIds.has(e.id));
}
