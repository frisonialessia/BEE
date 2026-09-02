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
    cyclePrediction: (id: string) =>
      [...queryKeys.opportunities.all, "cycle-prediction", id] as const,
  },
  battlecards: {
    all: ["battlecards"] as const,
    ready: () => [...queryKeys.battlecards.all, "ready"] as const,
  },
  orchestrator: {
    pending: (limit?: number) => ["orchestrator", "pending", limit] as const,
    status: () => ["orchestrator", "status"] as const,
  },
  priorityFeed: {
    all: ["priority-feed"] as const,
    today: () => [...queryKeys.priorityFeed.all, "today"] as const,
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
  meetings: {
    all: ["meetings"] as const,
    range: (startsAfter?: string, startsBefore?: string) =>
      [...queryKeys.meetings.all, "range", startsAfter ?? "", startsBefore ?? ""] as const,
  },
  companies: {
    all: ["companies"] as const,
    list: (limit?: number) => [...queryKeys.companies.all, "list", limit] as const,
    detail: (id: string) => [...queryKeys.companies.all, "detail", id] as const,
    duplicates: () => [...queryKeys.companies.all, "duplicates"] as const,
    activity: (id: string) => [...queryKeys.companies.all, "activity", id] as const,
    brief: (id: string) => [...queryKeys.companies.all, "brief", id] as const,
  },
  teams: {
    all: ["teams"] as const,
    list: () => [...queryKeys.teams.all, "list"] as const,
    profile: (teamId: string) => [...queryKeys.teams.all, "profile", teamId] as const,
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
  organizationProfile: {
    all: ["organization-profile"] as const,
    detail: () => [...queryKeys.organizationProfile.all, "detail"] as const,
  },
  autopilot: {
    all: ["autopilot"] as const,
    config: () => [...queryKeys.autopilot.all, "config"] as const,
  },
  federatedIntelligence: {
    all: ["federatedIntelligence"] as const,
    config: () => [...queryKeys.federatedIntelligence.all, "config"] as const,
  },
  icp: {
    all: ["icp"] as const,
    criteria: () => [...queryKeys.icp.all, "criteria"] as const,
  },
  anomalies: {
    all: ["anomalies"] as const,
    open: () => [...queryKeys.anomalies.all, "open"] as const,
  },
  feedback: {
    all: ["feedback"] as const,
    patterns: (signalType?: string) =>
      [...queryKeys.feedback.all, "patterns", signalType ?? "all"] as const,
  },
  marketInsights: {
    all: ["marketInsights"] as const,
    list: (signalType?: string, industry?: string) =>
      [...queryKeys.marketInsights.all, signalType ?? "all", industry ?? "all"] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    list: (opportunityId?: string) => [...queryKeys.tasks.all, "list", opportunityId ?? "all"] as const,
    overdue: () => [...queryKeys.tasks.all, "overdue"] as const,
  },
  savedViews: {
    all: ["saved-views"] as const,
    list: (page: string) => [...queryKeys.savedViews.all, "list", page] as const,
  },
  outboundWebhooks: {
    all: ["outbound-webhooks"] as const,
    list: () => [...queryKeys.outboundWebhooks.all, "list"] as const,
    eventTypes: () => [...queryKeys.outboundWebhooks.all, "event-types"] as const,
  },
  sequences: {
    all: ["dynamic-sequences"] as const,
    list: () => [...queryKeys.sequences.all, "list"] as const,
    detail: (id: string) => [...queryKeys.sequences.all, "detail", id] as const,
    channelStatus: () => [...queryKeys.sequences.all, "channel-status"] as const,
  },
  integrations: {
    all: ["integrations"] as const,
    list: () => [...queryKeys.integrations.all, "list"] as const,
  },
  auditDecisions: {
    all: ["audit-decisions"] as const,
    strategyReasoning: (opportunityId: string) =>
      [...queryKeys.auditDecisions.all, "strategy-reasoning", opportunityId] as const,
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
