/**
 * Sandbox data for the Resumen sections that used to exist only on the
 * authenticated dashboard: the Bandeja de Decisiones (server-ranked on the
 * real API), the revenue simulator, and quotas. Everything is derived from
 * the same local demo dataset the rest of `/probar` already shows (`store.ts`),
 * so the numbers agree with the CRM/Pronóstico pages next to them instead of
 * being a second, invented set — same rule as `getDarkFunnelSummary()`.
 */

import { getDemoLocale } from "@/lib/demo/locale";
import {
  demoFetchAllBattlecards,
  demoFetchMeetings,
  demoFetchOpenAnomalies,
  demoFetchOpportunities,
  demoFetchPendingActions,
  demoFetchTeams,
  demoFetchUsers,
} from "@/lib/demo/store";
import type { Quota } from "@/lib/api/quotas";
import { computeQuotaActual, computeQuotaClients } from "@/lib/quotas";
import type { DecisionCard, RevenueSimulation, TodayFeedOut } from "@/types/extended";

const DISMISSED_KEY = "bee.demo.feedDismissed.v1";

function readDismissed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function demoDismissFromFeed(opportunityId: string): void {
  if (typeof window === "undefined") return;
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...readDismissed(), [opportunityId]: until }));
  } catch {
    // Not persisting the dismissal isn't worth an error in the sandbox.
  }
}

const COPY = {
  es: {
    approve: (c: string) => ({
      headline: `${c} tiene un borrador listo para aprobar`,
      reasoning: "BEE redactó el siguiente paso con la voz de tu marca — solo falta tu OK para enviarlo.",
    }),
    hot: (c: string, score: number) => ({
      headline: `${c} está en ventana de compra`,
      reasoning: `Score ${score} y actividad de investigación reciente — el momento de llamar es esta semana, no la próxima.`,
    }),
    meeting: (c: string, when: string) => ({
      headline: `Prepara la reunión con ${c}`,
      reasoning: `Tienes una reunión ${when}. Revisa el battlecard y el argumento de cierre antes de entrar.`,
    }),
    stalled: (c: string, days: number) => ({
      headline: `${c} lleva ${days} días sin avanzar`,
      reasoning: "Sigue en conversación sin actividad nueva — un correo corto de re-enganche suele destrabarlo.",
    }),
    anomaly: (title: string) => ({
      headline: title,
      reasoning: "La tasa de conversión de este segmento se salió de su rango histórico — vale la pena revisar antes de seguir invirtiendo ahí.",
    }),
    closing: (c: string, days: number) => ({
      headline: days === 0 ? `${c} cierra hoy` : `${c} cierra en ${days} días`,
      reasoning: "La fecha de cierre está encima — confirma el siguiente paso con quien decide antes de que se corra.",
    }),
    qualify: (c: string, score: number) => ({
      headline: `Califica a ${c} antes de que se enfríe`,
      reasoning: `Entró con score ${score} y nadie la ha revisado — cinco minutos hoy valen más que una hora la próxima semana.`,
    }),
    soon: "en las próximas 48 h",
    today: "hoy",
  },
  en: {
    approve: (c: string) => ({
      headline: `${c} has a draft waiting for your approval`,
      reasoning: "BEE drafted the next step in your brand voice — it only needs your OK to go out.",
    }),
    hot: (c: string, score: number) => ({
      headline: `${c} is in a buying window`,
      reasoning: `Score ${score} plus fresh research activity — the call belongs this week, not next.`,
    }),
    meeting: (c: string, when: string) => ({
      headline: `Prep the meeting with ${c}`,
      reasoning: `You have a meeting ${when}. Review the battlecard and the closing argument before you join.`,
    }),
    stalled: (c: string, days: number) => ({
      headline: `${c} has gone ${days} days without movement`,
      reasoning: "Still in conversation with no new activity — a short re-engagement email usually unblocks it.",
    }),
    anomaly: (title: string) => ({
      headline: title,
      reasoning: "This segment's conversion rate left its historical range — worth a look before investing more there.",
    }),
    closing: (c: string, days: number) => ({
      headline: days === 0 ? `${c} closes today` : `${c} closes in ${days} days`,
      reasoning: "The close date is on top of you — confirm the next step with the decision maker before it slips.",
    }),
    qualify: (c: string, score: number) => ({
      headline: `Qualify ${c} before it cools off`,
      reasoning: `It came in with score ${score} and nobody has looked yet — five minutes today beat an hour next week.`,
    }),
    soon: "in the next 48h",
    today: "today",
  },
} as const;

function companyOf(title: string, companyName: string | null | undefined): string {
  return companyName ?? title.split(/ — | raised | cerró | abrió /)[0];
}

/** Mirrors PriorityFeedService's fusion (pending approvals → buying window →
 *  upcoming meeting → stalled deals → open anomalies), capped at five cards. */
export function demoTodayFeed(): TodayFeedOut {
  const copy = COPY[getDemoLocale()];
  const now = Date.now();
  const dismissed = readDismissed();
  const isDismissed = (id: string) => dismissed[id] !== undefined && new Date(dismissed[id]).getTime() > now;

  const opportunities = demoFetchOpportunities().filter(
    (o) => !["won", "lost", "dismissed"].includes(o.status) && !isDismissed(o.id),
  );
  const battlecards = new Map(demoFetchAllBattlecards().map((b) => [b.opportunity_id, b]));
  const cards: DecisionCard[] = [];
  const used = new Set<string>();

  for (const action of demoFetchPendingActions()) {
    if (action.status !== "pending_approval") continue;
    const opp = opportunities.find((o) => o.id === action.opportunity_id);
    if (!opp || used.has(opp.id)) continue;
    const c = copy.approve(companyOf(opp.title, battlecards.get(opp.id)?.company.name));
    cards.push({
      id: `feed-${opp.id}`,
      kind: "opportunity",
      company_name: companyOf(opp.title, battlecards.get(opp.id)?.company.name),
      ...c,
      urgency: "high",
      recommended_action: "email",
      opportunity_id: opp.id,
      pending_action_id: action.id,
      score: 0.95,
    });
    used.add(opp.id);
    break;
  }

  // Up to two buying-window plays: the Resumen box fills itself with as
  // many rows as fit, so the feed carries more than one of each kind.
  const hots = opportunities
    .filter((o) => !used.has(o.id) && (battlecards.get(o.id)?.hot_lead || o.score >= 75))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  for (const hot of hots) {
    const name = companyOf(hot.title, battlecards.get(hot.id)?.company.name);
    cards.push({
      id: `feed-${hot.id}`,
      kind: "opportunity",
      company_name: name,
      ...copy.hot(name, Math.round(hot.score)),
      urgency: "high",
      recommended_action: "call",
      opportunity_id: hot.id,
      pending_action_id: null,
      score: 0.9,
    });
    used.add(hot.id);
  }

  const closing = opportunities
    .filter((o) => !used.has(o.id) && o.expected_close_date)
    .map((o) => ({ o, days: Math.ceil((new Date(o.expected_close_date as string).getTime() - now) / 86_400_000) }))
    .filter(({ days }) => days >= 0 && days <= 14)
    .sort((a, b) => a.days - b.days)[0];
  if (closing) {
    const name = companyOf(closing.o.title, battlecards.get(closing.o.id)?.company.name);
    cards.push({
      id: `feed-${closing.o.id}`,
      kind: "opportunity",
      company_name: name,
      ...copy.closing(name, closing.days),
      urgency: "high",
      recommended_action: "review",
      opportunity_id: closing.o.id,
      pending_action_id: null,
      score: 0.8,
    });
    used.add(closing.o.id);
  }

  const upcoming = demoFetchMeetings()
    .filter((m) => m.opportunity_id && !used.has(m.opportunity_id))
    .map((m) => ({ m, delta: new Date(m.starts_at).getTime() - now }))
    .filter(({ delta }) => delta > 0 && delta < 2 * 86_400_000)
    .sort((a, b) => a.delta - b.delta)[0];
  if (upcoming) {
    const opp = opportunities.find((o) => o.id === upcoming.m.opportunity_id);
    if (opp) {
      const name = companyOf(opp.title, battlecards.get(opp.id)?.company.name);
      const when = upcoming.delta < 86_400_000 ? copy.today : copy.soon;
      cards.push({
        id: `feed-${opp.id}`,
        kind: "opportunity",
        company_name: name,
        ...copy.meeting(name, when),
        urgency: "medium",
        recommended_action: "review",
        opportunity_id: opp.id,
        pending_action_id: null,
        score: 0.7,
      });
      used.add(opp.id);
    }
  }

  const stalledList = opportunities
    .filter((o) => o.status === "in_progress" && !used.has(o.id))
    .map((o) => ({ o, days: Math.floor((now - new Date(o.updated_at ?? o.created_at).getTime()) / 86_400_000) }))
    .filter(({ days }) => days >= 10)
    .sort((a, b) => b.days - a.days)
    .slice(0, 2);
  for (const stalled of stalledList) {
    const name = companyOf(stalled.o.title, battlecards.get(stalled.o.id)?.company.name);
    cards.push({
      id: `feed-${stalled.o.id}`,
      kind: "opportunity",
      company_name: name,
      ...copy.stalled(name, stalled.days),
      urgency: "medium",
      recommended_action: "email",
      opportunity_id: stalled.o.id,
      pending_action_id: null,
      score: 0.55,
    });
    used.add(stalled.o.id);
  }

  // Fresh opportunities nobody has qualified yet — up to two, so the box
  // has a play for the new arrivals too.
  const fresh = opportunities
    .filter((o) => !used.has(o.id) && (o.status === "detected" || o.status === "prioritized") && now - new Date(o.created_at).getTime() <= 14 * 86_400_000)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  for (const o of fresh) {
    const name = companyOf(o.title, battlecards.get(o.id)?.company.name);
    cards.push({
      id: `feed-${o.id}`,
      kind: "opportunity",
      company_name: name,
      ...copy.qualify(name, Math.round(o.score)),
      urgency: o.score >= 70 ? "medium" : "low",
      recommended_action: "review",
      opportunity_id: o.id,
      pending_action_id: null,
      score: 0.45,
    });
    used.add(o.id);
  }

  const anomaly = demoFetchOpenAnomalies().find((a) => a.severity === "high" || a.severity === "critical");
  if (anomaly) {
    cards.push({
      id: `feed-anomaly-${anomaly.id}`,
      kind: "anomaly",
      company_name: null,
      ...copy.anomaly(anomaly.title),
      urgency: anomaly.severity === "critical" ? "high" : "low",
      recommended_action: "pause",
      opportunity_id: null,
      pending_action_id: null,
      score: 0.5,
    });
  }

  return { cards: cards.slice(0, 8), generated_at: new Date(now).toISOString() };
}

/** Same shape as RevenueSimulatorService: win rate from this dataset's
 *  closed deals for the chosen signal type, projected over more prospecting. */
export function demoRevenueSimulation(params: {
  signal_type: string;
  industry?: string;
  increase_factor?: number;
}): RevenueSimulation {
  const locale = getDemoLocale();
  const factor = params.increase_factor ?? 2;
  const battlecards = new Map(demoFetchAllBattlecards().map((b) => [b.opportunity_id, b]));
  const all = demoFetchOpportunities();
  const ofType = all.filter((o) => (battlecards.get(o.id)?.signal.signal_type ?? "funding_round") === params.signal_type);
  const pool = ofType.length >= 3 ? ofType : all;
  const closed = pool.filter((o) => o.status === "won" || o.status === "lost");
  const won = closed.filter((o) => o.status === "won");
  const winRate = closed.length > 0 ? won.length / closed.length : 0.3;
  const open = pool.filter((o) => !["won", "lost", "dismissed"].includes(o.status)).length;
  const baseline = Math.round(open * winRate);
  const wonWithStrategy = won.filter((o) => o.strategy?.playbook);
  const topPlaybook = wonWithStrategy[0]?.strategy?.playbook ?? null;
  const topChannel = wonWithStrategy[0]?.strategy?.channel ?? null;
  const confidence = closed.length >= 10 ? "high" : closed.length >= 5 ? "medium" : closed.length > 0 ? "low" : "none";

  const scenario = (label: string, multiplier: number) => {
    const newPipeline = Math.round(open * factor * multiplier);
    const wonDeals = Math.round(newPipeline * winRate);
    return {
      label,
      multiplier,
      prospecting_increase_factor: factor,
      projected_new_pipeline: newPipeline,
      projected_won_deals: wonDeals,
      uplift_vs_baseline: Math.max(0, wonDeals - baseline),
    };
  };

  return {
    signal_type: params.signal_type,
    industry: params.industry ?? null,
    increase_factor: factor,
    current_pipeline_count: open,
    historical_win_rate: Math.round(winRate * 100) / 100,
    data_confidence: confidence,
    sample_size: closed.length,
    baseline_expected_won: baseline,
    scenarios: [scenario("Conservative", 0.7), scenario("Realistic", 1), scenario("Optimistic", 1.3)],
    top_playbook: topPlaybook,
    top_channel: topChannel,
    recommendation:
      locale === "en"
        ? `Doubling prospecting on ${params.signal_type.replace("_", " ")} signals projects ${scenario("Realistic", 1).projected_won_deals} won deals against a baseline of ${baseline}.`
        : `Duplicar la prospección sobre señales de ${params.signal_type.replace("_", " ")} proyecta ${scenario("Realistic", 1).projected_won_deals} deals ganados frente a una base de ${baseline}.`,
    disclaimer:
      locale === "en"
        ? `Based on ${closed.length} closed deals in this sandbox — a projection, not a forecast.`
        : `Basado en ${closed.length} deals cerrados de este sandbox — es una proyección, no un pronóstico.`,
  };
}

/** Monthly goals for the current calendar month (goals are monthly, in the
 *  team's currency and/or in clients), sized off each rep's real won revenue
 *  this month: the first rep with a close this month is over her *money*
 *  goal (the one green row Ventas is allowed), the rest are on pace, and the
 *  team as a whole sits under halfway — so the Brief and the rings have
 *  something true to say without every number being a round success. Her
 *  *deal-count* goal (the one "Tu semana en BEE" reads — see
 *  weekly-recap-card.tsx) is set to exactly what she's already closed this
 *  month, on purpose: a full, green "4 of 4" reads as a goal actually met,
 *  not a broken fraction past 100% (which a lower target would give) nor
 *  a goal that's still open (which a higher one would). */
export function demoFetchQuotas(): Quota[] {
  const users = demoFetchUsers();
  const teams = demoFetchTeams();
  const opportunities = demoFetchOpportunities();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const round = (n: number) => Math.max(10_000, Math.round(n / 5_000) * 5_000);

  let starPicked = false;
  const quotas: Quota[] = users.map((u) => {
    const base = { id: `demo-quota-${u.id}`, user_id: u.id, team_id: null, period_start: iso(start), period_end: iso(end), target_amount: 0, target_count: null };
    const actual = computeQuotaActual(base, users, opportunities);
    if (actual > 0 && !starPicked) {
      starPicked = true;
      const clients = computeQuotaClients(base, users, opportunities);
      return { ...base, target_amount: round(actual * 0.8), target_count: Math.max(1, clients) };
    }
    return { ...base, target_amount: round(actual > 0 ? actual / 0.7 : 30_000) };
  });
  for (const team of teams) {
    const base = { id: `demo-quota-${team.id}`, user_id: null, team_id: team.id, period_start: iso(start), period_end: iso(end), target_amount: 0, target_count: null };
    const actual = computeQuotaActual(base, users, opportunities);
    // Client target derived from what actually closed this month (twice
    // that), so the count axis tells the same "under halfway" story as the
    // amount axis instead of an asserted number no seed can reach.
    const monthWins = opportunities.filter((o) => o.status === "won" && o.closed_at && o.closed_at.slice(0, 10) >= base.period_start && o.closed_at.slice(0, 10) <= base.period_end).length;
    quotas.push({ ...base, target_amount: round(actual > 0 ? actual / 0.45 : 100_000), target_count: Math.max(2, monthWins * 2) });
  }
  return quotas;
}
