/**
 * Router de intención del Asistente BEE — v1 basada en reglas.
 *
 * Responde sobre los datos reales que ya están cargados en el dashboard
 * (nada inventado). Cuando se conecte un modelo de IA real (OpenAI/
 * Anthropic), esta función se reemplaza por una llamada al modelo — la
 * interfaz de chat (mensajes, hilo, entrada) no cambia en nada.
 */

import type { HotLeadScore } from "@/types/extended";
import type { LeadCard, LeadColumnId } from "@/types/control";
import type { Opportunity, Signal } from "@/types/domain";
import type { UserOut } from "@/types/auth";

export interface AssistantContext {
  signals: Signal[];
  opportunities: Opportunity[];
  leadCards: LeadCard[];
  hotLeads: HotLeadScore[];
  users: UserOut[];
}

const COLUMN_LABELS: Record<LeadColumnId, string> = {
  detected: "detectadas",
  enriching: "enriqueciéndose",
  ready_to_action: "listas para actuar",
  in_progress: "en progreso",
  closed: "cerradas",
};

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}

function pipelineSummary(ctx: AssistantContext): string {
  const total = ctx.opportunities.length;
  if (total === 0) return "Todavía no hay oportunidades en el pipeline.";

  const counts: Record<LeadColumnId, number> = {
    detected: 0,
    enriching: 0,
    ready_to_action: 0,
    in_progress: 0,
    closed: 0,
  };
  for (const card of ctx.leadCards) counts[card.column] += 1;

  const won = ctx.opportunities.filter((o) => o.status === "won").length;
  const lost = ctx.opportunities.filter((o) => o.status === "lost").length;

  const lines = (Object.keys(counts) as LeadColumnId[])
    .filter((k) => counts[k] > 0)
    .map((k) => `• ${counts[k]} ${COLUMN_LABELS[k]}`)
    .join("\n");

  return `Tienes ${total} oportunidades en total:\n${lines}\n\nDe las cerradas: ${won} ganadas, ${lost} perdidas.`;
}

function hotLeadsSummary(ctx: AssistantContext): string {
  const hot = ctx.hotLeads.filter((l) => l.is_hot).slice(0, 5);
  if (hot.length === 0) {
    return "No hay leads marcados como calientes ahora mismo — te aviso apenas aparezca uno.";
  }
  const lines = hot
    .map((l) => `• ${l.company_name ?? l.company_domain} — temperatura ${Math.round(l.research_intensity_score)}°`)
    .join("\n");
  return `Estos son tus leads más calientes ahora mismo:\n${lines}`;
}

function signalsSummary(ctx: AssistantContext): string {
  const total = ctx.signals.length;
  if (total === 0) return "No hay señales recientes cargadas.";
  const avg = Math.round(ctx.signals.reduce((sum, s) => sum + s.score, 0) / total);
  const hot = ctx.signals.filter((s) => s.score >= 75).length;
  return `Tienes ${total} señales recientes, con un score promedio de ${avg}. ${hot} de alta intención (score ≥ 75).`;
}

function leaderboardSummary(ctx: AssistantContext): string {
  const usersById = new Map(ctx.users.map((u) => [u.id, u]));
  const won = new Map<string, number>();
  for (const o of ctx.opportunities) {
    if (o.status !== "won" || !o.assigned_to_user_id) continue;
    won.set(o.assigned_to_user_id, (won.get(o.assigned_to_user_id) ?? 0) + 1);
  }
  const ranked = Array.from(won.entries())
    .map(([id, count]) => ({ user: usersById.get(id), count }))
    .filter((r): r is { user: UserOut; count: number } => Boolean(r.user))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (ranked.length === 0) return "Todavía no hay oportunidades ganadas asignadas a alguien del equipo.";
  const lines = ranked.map((r, i) => `${i + 1}. ${r.user.full_name} — ${r.count} ganadas`).join("\n");
  return `El ranking del equipo por oportunidades ganadas:\n${lines}`;
}

const CAPABILITIES = `Puedo ayudarte con preguntas sobre tus datos reales de BEE:
• "¿Cómo va mi pipeline?" — resumen por etapa
• "¿Cuáles son mis leads calientes?" — quién está listo para comprar
• "¿Cuántas señales tengo?" — actividad de mercado reciente
• "¿Quién va ganando?" — ranking del equipo

Por ahora respondo con reglas sobre tus datos (no un modelo de IA todavía) — cuando conectemos un modelo real, voy a poder razonar sobre preguntas más abiertas.`;

export function routeAssistantMessage(message: string, ctx: AssistantContext): string {
  const text = message.toLowerCase().trim();

  if (includesAny(text, ["ayuda", "qué puedes hacer", "que puedes hacer", "capacidades"])) {
    return CAPABILITIES;
  }
  if (includesAny(text, ["pipeline", "resumen", "cómo va todo", "como va todo", "estado general"])) {
    return pipelineSummary(ctx);
  }
  if (includesAny(text, ["caliente", "listo para comprar", "listos para comprar", "hot"])) {
    return hotLeadsSummary(ctx);
  }
  if (includesAny(text, ["señal", "senal", "actividad de mercado"])) {
    return signalsSummary(ctx);
  }
  if (includesAny(text, ["ranking", "quién va ganando", "quien va ganando", "mejor vendedor", "leaderboard"])) {
    return leaderboardSummary(ctx);
  }
  if (includesAny(text, ["gan", "perdid"])) {
    const won = ctx.opportunities.filter((o) => o.status === "won").length;
    const lost = ctx.opportunities.filter((o) => o.status === "lost").length;
    return `Tienes ${won} oportunidades ganadas y ${lost} perdidas.`;
  }

  return `Todavía no tengo una regla para esa pregunta exacta. ${CAPABILITIES}`;
}
