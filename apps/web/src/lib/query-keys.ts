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
  leads: {
    all: ["leads"] as const,
    list: (limit?: number) => [...queryKeys.leads.all, "list", limit] as const,
    duplicates: () => [...queryKeys.leads.all, "duplicates"] as const,
  },
  companies: {
    all: ["companies"] as const,
    list: (limit?: number) => [...queryKeys.companies.all, "list", limit] as const,
    detail: (id: string) => [...queryKeys.companies.all, "detail", id] as const,
    duplicates: () => [...queryKeys.companies.all, "duplicates"] as const,
  },
  teams: {
    all: ["teams"] as const,
    list: () => [...queryKeys.teams.all, "list"] as const,
  },
  users: {
    all: ["users"] as const,
    list: () => [...queryKeys.users.all, "list"] as const,
  },
  psychographic: {
    all: ["psychographic"] as const,
    lead: (leadId: string) => [...queryKeys.psychographic.all, "lead", leadId] as const,
  },
  templates: {
    all: ["templates"] as const,
    list: () => [...queryKeys.templates.all, "list"] as const,
  },
  quotas: {
    all: ["quotas"] as const,
    list: () => [...queryKeys.quotas.all, "list"] as const,
  },
  icp: {
    all: ["icp"] as const,
    criteria: () => [...queryKeys.icp.all, "criteria"] as const,
  },
  anomalies: {
    all: ["anomalies"] as const,
    open: () => [...queryKeys.anomalies.all, "open"] as const,
  },
  control: {
    all: ["control"] as const,
    systemHealth: () => [...queryKeys.control.all, "system-health"] as const,
    ingestion: () => [...queryKeys.control.all, "ingestion"] as const,
    signalStream: (limit?: number) =>
      [...queryKeys.control.all, "signal-stream", limit] as const,
    hiveLeads: (limit?: number) =>
      [...queryKeys.control.all, "hive-leads", limit] as const,
  },
} as const;
