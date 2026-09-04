import type { AuditEntry, HotLeadScore } from "@/types/extended";
import type { Signal } from "@/types/domain";

export interface AppNotification {
  id: string;
  kind: "hot_lead" | "hot_signal" | "review_required";
  title: string;
  description: string;
  timestamp: string;
  href: string;
}

const AGENT_LABELS: Record<string, string> = {
  strategy_generator: "Generador de estrategias",
  executive_agent: "Agente ejecutivo",
  psychographic_analyzer: "Analizador psicográfico",
  dark_funnel: "Dark Funnel",
  smart_engagement: "Engagement inteligente",
  agent_orchestrator: "Orquestador",
  workflow_orchestrator: "Flujo de trabajo",
  trend_analyst: "Analista de tendencias",
};

/**
 * Convierte datos ya reales en notificaciones — nada simulado. Se recalcula
 * cada vez que llegan datos nuevos (las consultas que lo alimentan hacen
 * polling), así que "notificar" hoy significa "aparecer en la lista",
 * sin necesitar un socket ni un servicio de push todavía.
 */
export function buildNotifications({
  hotLeads,
  signals,
  reviewEntries,
}: {
  hotLeads: HotLeadScore[];
  signals: Signal[];
  reviewEntries: AuditEntry[];
}): AppNotification[] {
  const items: AppNotification[] = [];

  for (const lead of hotLeads) {
    if (!lead.is_hot) continue;
    items.push({
      id: `hot-lead-${lead.id}`,
      kind: "hot_lead",
      title: `Lead caliente: ${lead.company_name ?? lead.company_domain}`,
      description: `Temperatura de cierre ${Math.round(lead.research_intensity_score)}°`,
      timestamp: lead.last_signal_at ?? new Date(0).toISOString(),
      href: "/dashboard/signals?tab=intent",
    });
  }

  for (const signal of signals) {
    if (signal.score < 75) continue;
    items.push({
      id: `hot-signal-${signal.id}`,
      kind: "hot_signal",
      title: `Señal de alta intención: ${signal.title}`,
      description: `Score ${Math.round(signal.score)}`,
      timestamp: signal.detected_at,
      href: "/dashboard/signals",
    });
  }

  for (const entry of reviewEntries) {
    if (!entry.manual_review_required) continue;
    items.push({
      id: `review-${entry.id}`,
      kind: "review_required",
      title: `Requiere revisión — ${AGENT_LABELS[entry.agent_type] ?? entry.agent_type}`,
      description: entry.strategy_reasoning ?? entry.decision_type.replace(/_/g, " "),
      timestamp: entry.created_at,
      href: "/dashboard/resilience",
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30);
}
