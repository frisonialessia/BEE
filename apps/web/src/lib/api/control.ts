import { apiFetch } from "@/lib/api/client";
import { fetchOpportunities } from "@/lib/api/opportunities";
import { fetchSignals } from "@/lib/api/signals";
import {
  buildSignalPipelineEvents,
  countReadyEvents,
  type SignalStreamSnapshot,
} from "@/lib/control/pipeline-builder";
import { isDemoMode } from "@/lib/demo/mode";
import { demoFetchOpportunities, demoFetchSignals } from "@/lib/demo/store";
import type { FetchResult } from "@/types/api";
import type {
  ApiConnectivity,
  IngestionWorkerStatus,
  ProviderHealthState,
  ProviderStatus,
  SystemHealthSnapshot,
  WorkerHealth,
} from "@/types/control";

interface HealthResponse {
  status: string;
  service?: string;
  environment?: string;
}

interface ReadyResponse {
  status: string;
}

/** Full simulation, per the BEE team's explicit call to show Control "como
 * si fuera real" in the sandbox — a healthy, operating pipeline rather than
 * an honest-but-confusing "no API configured" state that would only ever
 * make sense on a real, unconfigured deployment. Static and deterministic:
 * no visitor sees a different worker load than the last one did. */
const DEMO_SYSTEM_HEALTH: SystemHealthSnapshot = {
  connectivity: {
    live: true,
    environment: "demo",
    db_ready: true,
    service: "bee-api",
  },
  worker: {
    running: true,
    queue_depth: 2,
    processed_count: 184,
    error_count: 0,
    load_pct: 20,
    state: "busy",
  },
  providers: [
    { name: "linkedin", configured: true, webhook_configured: true, rate_limit_per_hour: 100, tokens_remaining: 82, tokens_capacity: 100, health: "online" },
    { name: "g2", configured: true, webhook_configured: false, rate_limit_per_hour: 50, tokens_remaining: 6, tokens_capacity: 50, health: "degraded" },
    { name: "google_search", configured: true, webhook_configured: false, rate_limit_per_hour: 200, tokens_remaining: 168, tokens_capacity: 200, health: "online" },
  ],
  fetched_at: new Date().toISOString(),
};

const OFFLINE_SNAPSHOT: SystemHealthSnapshot = {
  connectivity: {
    live: false,
    environment: null,
    db_ready: false,
    service: null,
  },
  worker: {
    running: false,
    queue_depth: 0,
    processed_count: 0,
    error_count: 0,
    load_pct: 0,
    state: "stopped",
  },
  providers: [],
  fetched_at: new Date().toISOString(),
};

function deriveProviderHealth(
  configured: boolean,
  tokensRemaining: number,
  capacity: number,
): ProviderHealthState {
  if (!configured) return "mock";
  if (capacity > 0 && tokensRemaining <= capacity * 0.1) return "degraded";
  return "online";
}

function deriveWorkerHealth(status: IngestionWorkerStatus): WorkerHealth {
  const load_pct = Math.min(100, status.queue_depth * 10);
  let state: WorkerHealth["state"] = "idle";
  if (!status.running) state = "stopped";
  else if (status.error_count > 0 && status.queue_depth > 0) state = "error";
  else if (status.queue_depth > 5) state = "busy";
  return {
    running: status.running,
    queue_depth: status.queue_depth,
    processed_count: status.processed_count,
    error_count: status.error_count,
    load_pct,
    state,
  };
}

function normalizeProviders(status: IngestionWorkerStatus): ProviderStatus[] {
  return status.providers.map((p) => {
    const bucket = status.rate_limits[p.name] ?? {
      tokens_remaining: 0,
      capacity: p.rate_limit_per_hour,
    };
    return {
      name: p.name,
      configured: p.configured,
      webhook_configured: p.webhook_configured,
      rate_limit_per_hour: p.rate_limit_per_hour,
      tokens_remaining: bucket.tokens_remaining,
      tokens_capacity: bucket.capacity,
      health: deriveProviderHealth(
        p.configured,
        bucket.tokens_remaining,
        bucket.capacity,
      ),
    };
  });
}

/** Fetch aggregated system health for the control dashboard. */
export async function fetchSystemHealth(): Promise<FetchResult<SystemHealthSnapshot>> {
  if (isDemoMode()) {
    return { live: false, data: { ...DEMO_SYSTEM_HEALTH, fetched_at: new Date().toISOString() } };
  }

  const fetched_at = new Date().toISOString();

  try {
    const [health, ready, ingestion] = await Promise.all([
      apiFetch<HealthResponse>("/api/v1/health", { cache: "no-store" }),
      apiFetch<ReadyResponse>("/api/v1/ready", { cache: "no-store" }).catch(
        () => ({ status: "unavailable" }),
      ),
      apiFetch<IngestionWorkerStatus>("/api/v1/webhooks/status", {
        cache: "no-store",
      }),
    ]);

    const connectivity: ApiConnectivity = {
      live: true,
      environment: health.environment ?? null,
      db_ready: ready.status === "ready",
      service: health.service ?? null,
    };

    return {
      live: true,
      data: {
        connectivity,
        worker: deriveWorkerHealth(ingestion),
        providers: normalizeProviders(ingestion),
        fetched_at,
      },
    };
  } catch {
    return { live: false, data: { ...OFFLINE_SNAPSHOT, fetched_at } };
  }
}

export async function fetchIngestionStatus(): Promise<
  FetchResult<IngestionWorkerStatus>
> {
  try {
    const data = await apiFetch<IngestionWorkerStatus>("/api/v1/webhooks/status", {
      cache: "no-store",
    });
    return { live: true, data };
  } catch {
    return {
      live: false,
      data: {
        running: false,
        queue_depth: 0,
        processed_count: 0,
        error_count: 0,
        providers: [],
        rate_limits: {},
      },
    };
  }
}

/** Pipeline feed: signals × opportunities × worker queue → stream events. */
export async function fetchSignalStream(limit = 40): Promise<FetchResult<SignalStreamSnapshot>> {
  const fetched_at = new Date().toISOString();

  if (isDemoMode()) {
    const events = buildSignalPipelineEvents(demoFetchSignals(limit), demoFetchOpportunities(), {
      running: true,
      queue_depth: 2,
      processed_count: 184,
      error_count: 0,
      providers: [],
      rate_limits: {},
    });
    return {
      live: false,
      data: { events, live: false, ready_count: countReadyEvents(events), fetched_at },
    };
  }

  try {
    const [signalsRes, oppsRes, workerRes] = await Promise.all([
      fetchSignals(limit),
      fetchOpportunities(undefined, limit),
      fetchIngestionStatus(),
    ]);

    const events = buildSignalPipelineEvents(
      signalsRes.data,
      oppsRes.data,
      workerRes.data,
    );

    return {
      live: signalsRes.live || oppsRes.live,
      data: {
        events,
        live: signalsRes.live || oppsRes.live,
        ready_count: countReadyEvents(events),
        fetched_at,
      },
    };
  } catch {
    // Honest empty, not fabricated demo data — same convention as
    // fetchSignals/fetchOpportunities. In practice this catch is dead code
    // today (both of those already swallow their own errors and never
    // throw), but it must degrade the same way if that ever changes: a
    // real account must never see a pipeline feed built from illustrative
    // companies as if it were their own activity.
    return {
      live: false,
      data: { events: [], live: false, ready_count: 0, fetched_at },
    };
  }
}
