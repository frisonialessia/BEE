import { computeForecast } from "@/lib/forecast";
import { computePriorities, isIcpConfigured } from "@/lib/icp";
import { computeQuotaPace, isQuotaActive } from "@/lib/quotas";
import type { AnomalyAlert } from "@/lib/api/anomalies";
import type { SuccessPattern } from "@/lib/api/feedback";
import type { IcpCriteria } from "@/lib/api/organizations";
import type { Quota } from "@/lib/api/quotas";
import type { CompanyDuplicateGroup } from "@/lib/api/companies";
import type { LeadDuplicateGroup } from "@/lib/api/leads";
import type { UserOut } from "@/types/auth";
import type { Company, Lead, Opportunity, OpportunityTask } from "@/types/domain";

export type BriefTone = "hot" | "risk" | "info";

/** Translator for the brief's own copy — `useTranslations(
 *  "dashboardOverview.dailyBrief.items")` in the component. Passed in (not
 *  imported) so this stays plain TypeScript, testable without React, and the
 *  strings live in messages/{locale}/dashboardOverview.json like everything
 *  else — they used to be Spanish literals regardless of UI language. */
export type BriefTranslator = (key: string, values?: Record<string, string | number>) => string;

export interface BriefItem {
  id: string;
  tone: BriefTone;
  title: string;
  description: string;
  href: string;
}

const DAY_MS = 86_400_000;

/** Junta lo que ya calcula el resto de BEE (pronóstico, anomalías, prioridad,
 *  cuotas, duplicados) en una sola lista de "esto necesita tu atención hoy" —
 *  nada se recalcula distinto de como ya se ve en su propia página, esto
 *  solo reúne. Si no hay nada real que decir, la lista sale vacía — nunca se
 *  inventa urgencia. */
export function computeDailyBrief(input: {
  today: Date;
  companies: Company[];
  opportunities: Opportunity[];
  leads: Lead[];
  icpCriteria: IcpCriteria;
  quotas: Quota[];
  users: UserOut[];
  companyDuplicates: CompanyDuplicateGroup[];
  leadDuplicates: LeadDuplicateGroup[];
  anomalies: AnomalyAlert[];
  overdueTasks: OpportunityTask[];
  successPatterns: SuccessPattern[];
}, t: BriefTranslator): BriefItem[] {
  const items: BriefItem[] = [];

  // ── Leads calientes nuevos (últimas 48h) ────────────────────────────────
  const newHotLeads = input.leads.filter(
    (l) => l.score >= 75 && input.today.getTime() - new Date(l.created_at).getTime() <= 2 * DAY_MS,
  );
  if (newHotLeads.length > 0) {
    items.push({
      id: "hot-leads",
      tone: "hot",
      title: t("hotLeads.title", { count: newHotLeads.length }),
      description: newHotLeads
        .slice(0, 3)
        .map((l) => l.full_name)
        .join(", "),
      href: "/dashboard/companies?tab=leads",
    });
  }

  // ── Tareas vencidas ──────────────────────────────────────────────────────
  if (input.overdueTasks.length > 0) {
    items.push({
      id: "overdue-tasks",
      tone: "risk",
      title: t("overdueTasks.title", { count: input.overdueTasks.length }),
      description: input.overdueTasks
        .slice(0, 3)
        .map((t) => t.title)
        .join(", "),
      href: "/dashboard/crm",
    });
  }

  // ── Deals en riesgo (mismo cálculo que Pronóstico) ──────────────────────
  const forecast = computeForecast(input.opportunities, input.today);
  if (forecast.atRisk.length > 0) {
    items.push({
      id: "at-risk",
      tone: "risk",
      title: t("atRisk.title", { count: forecast.atRisk.length }),
      description: t("atRisk.description"),
      href: "/dashboard/forecast",
    });
  }

  // ── Anomalías de conversión (mismo dato que Control → Anomalías) ────────
  // Solo alta/crítica en el brief — baja/media se revisan en Control, no
  // ameritan interrumpir el resumen del día.
  const severeAnomalies = input.anomalies.filter(
    (a) => a.severity === "high" || a.severity === "critical",
  );
  if (severeAnomalies.length > 0) {
    items.push({
      id: "anomalies",
      tone: "risk",
      title: t("anomalies.title", { count: severeAnomalies.length }),
      description: severeAnomalies[0].title,
      href: "/dashboard/control",
    });
  }

  // ── Prioridad máxima (mismo cálculo que Priorización) ───────────────────
  if (isIcpConfigured(input.icpCriteria)) {
    const priorities = computePriorities(input.companies, input.icpCriteria, {
      opportunities: input.opportunities,
      leads: input.leads,
      signals: [],
    });
    const topPriority = priorities.filter((p) => p.quadrant === "priority");
    if (topPriority.length > 0) {
      items.push({
        id: "priority",
        tone: "hot",
        title: t("priority.title", { count: topPriority.length }),
        description: t("priority.description"),
        href: "/dashboard/signals?tab=priority",
      });
    }
  }

  // ── Ritmo de cuota (mismo cálculo que Equipo → Territorios y cuotas) ────
  const activeQuotas = input.quotas.filter((q) => isQuotaActive(q, input.today));
  const behindQuotas = activeQuotas.filter(
    (q) => computeQuotaPace(q, input.users, input.opportunities, input.today).isBehind,
  );
  if (behindQuotas.length > 0) {
    items.push({
      id: "quota-pace",
      tone: "risk",
      title: t("quotaPace.title", { count: behindQuotas.length }),
      description: t("quotaPace.description"),
      href: "/dashboard/team",
    });
  }

  // ── Aprendizaje del día (mismo dato que Estrategias → Aprendizaje) ──────
  // Solo patrones con muestra suficiente para ser accionables (confianza
  // media/alta, igual que el umbral que ya usa StrategyGeneratorService para
  // sesgar la generación) — un patrón de baja confianza no amerita
  // interrumpir el brief, se revisa en la pestaña dedicada si hace falta.
  const actionablePatterns = input.successPatterns.filter((p) => p.confidence !== "low");
  if (actionablePatterns.length > 0) {
    const top = actionablePatterns[0];
    items.push({
      id: "learning",
      tone: "info",
      title: t("learning.title", { count: actionablePatterns.length }),
      description: t("learning.description", {
        playbook: top.playbook,
        channel: top.channel,
        winRate: Math.round(top.win_rate * 100),
        sampleSize: top.sample_size,
      }),
      href: "/dashboard/strategies",
    });
  }

  // ── Duplicados por revisar ───────────────────────────────────────────────
  const duplicateGroups = input.companyDuplicates.length + input.leadDuplicates.length;
  if (duplicateGroups > 0) {
    items.push({
      id: "duplicates",
      tone: "info",
      title: t("duplicates.title", { count: duplicateGroups }),
      description: t("duplicates.description"),
      href: "/dashboard/companies",
    });
  }

  return items;
}
