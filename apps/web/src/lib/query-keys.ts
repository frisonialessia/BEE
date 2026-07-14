/**
 * TanStack Query key factory — single source for cache identity and invalidation.
 */
export const queryKeys = {
  signals: {
    all: ["signals"] as const,
    list: (limit?: number) => [...queryKeys.signals.all, "list", limit] as const,
  },
  opportunities: {
    all: ["opportunities"] as const,
    list: (status?: string) =>
      [...queryKeys.opportunities.all, "list", status ?? "all"] as const,
    detail: (id: string) => [...queryKeys.opportunities.all, "detail", id] as const,
    battlecard: (id: string) =>
      [...queryKeys.opportunities.all, "battlecard", id] as const,
    artifacts: (id: string) =>
      [...queryKeys.opportunities.all, "artifacts", id] as const,
  },
  battlecards: {
    all: ["battlecards"] as const,
    ready: () => [...queryKeys.battlecards.all, "ready"] as const,
  },
  orchestrator: {
    pending: (limit?: number) => ["orchestrator", "pending", limit] as const,
    status: () => ["orchestrator", "status"] as const,
  },
  workflow: {
    tasks: (entityId?: string) => ["workflow", "tasks", entityId] as const,
    status: () => ["workflow", "status"] as const,
  },
  control: {
    all: ["control"] as const,
    systemHealth: () => [...queryKeys.control.all, "system-health"] as const,
    ingestion: () => [...queryKeys.control.all, "ingestion"] as const,
    signalStream: (limit?: number) =>
      [...queryKeys.control.all, "signal-stream", limit] as const,
  },
} as const;
