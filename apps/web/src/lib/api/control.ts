import { apiFetch } from "@/lib/api/client";
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
