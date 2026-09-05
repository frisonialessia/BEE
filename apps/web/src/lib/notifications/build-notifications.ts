import type { AuditEntry, HotLeadScore } from "@/types/extended";
import type { Meeting, Signal } from "@/types/domain";
import type { MilestoneLogEntry } from "@/lib/notifications/milestone-log";

export interface AppNotification {
  id: string;
  kind: "hot_lead" | "hot_signal" | "review_required" | "meeting_soon" | "milestone";
  title: string;
  description: string;
  timestamp: string;
  href: string;
}

/** A meeting counts as "soon" from now until 30 minutes out — long enough
 *  to still be useful, short enough that it's never a stale reminder for
 *  something that started an hour ago. */
const MEETING_SOON_WINDOW_MS = 30 * 60 * 1000;

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
  meetings = [],
  meId = null,
  now = Date.now(),
  milestoneLog = [],
}: {
  hotLeads: HotLeadScore[];
  signals: Signal[];
  reviewEntries: AuditEntry[];
  /** This rep's own meetings — only ones they created or are attending
   *  ever surface a "meeting_soon" notification, never a teammate's. */
  meetings?: Meeting[];
  meId?: string | null;
  now?: number;
  /** Already-celebrated milestone toasts (see milestone-log.ts) — the
   *  toast itself is transient, this is what the bell still has after it
   *  fades. */
  milestoneLog?: MilestoneLogEntry[];
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

  if (meId) {
    for (const meeting of meetings) {
      if (meeting.created_by_user_id !== meId && !meeting.attendee_user_ids.includes(meId)) continue;
      const startsAt = new Date(meeting.starts_at).getTime();
      const minutesUntil = Math.round((startsAt - now) / 60_000);
      if (minutesUntil < 0 || startsAt - now > MEETING_SOON_WINDOW_MS) continue;
      items.push({
        id: `meeting-soon-${meeting.id}`,
        kind: "meeting_soon",
        title: `Reunión pronto: ${meeting.title}`,
        description: minutesUntil <= 0 ? "Está empezando" : `En ${minutesUntil} min`,
        timestamp: meeting.starts_at,
        href: "/dashboard/calendar",
      });
    }
  }

  for (const entry of milestoneLog) {
    items.push({
      id: `milestone-${entry.count}-${entry.timestamp}`,
      kind: "milestone",
      title: `Hito alcanzado: ${entry.count} cierres tuyos`,
      description: "Tu semana en BEE — camino de hitos",
      timestamp: entry.timestamp,
      href: "/dashboard",
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30);
}
