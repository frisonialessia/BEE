import { computeForecast } from "@/lib/forecast";
import { computePriorities, isIcpConfigured } from "@/lib/icp";
import { computeQuotaPace, isQuotaActive } from "@/lib/quotas";
import type { AnomalyAlert } from "@/lib/api/anomalies";
import type { IcpCriteria } from "@/lib/api/organizations";
import type { Quota } from "@/lib/api/quotas";
import type { CompanyDuplicateGroup } from "@/lib/api/companies";
import type { LeadDuplicateGroup } from "@/lib/api/leads";
import type { UserOut } from "@/types/auth";
import type { Company, Lead, Opportunity, OpportunityTask } from "@/types/domain";

export type BriefTone = "hot" | "risk" | "info";

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
}): BriefItem[] {
  const items: BriefItem[] = [];

  // ── Leads calientes nuevos (últimas 48h) ────────────────────────────────
  const newHotLeads = input.leads.filter(
    (l) => l.score >= 75 && input.today.getTime() - new Date(l.created_at).getTime() <= 2 * DAY_MS,
  );
  if (newHotLeads.length > 0) {
    items.push({
      id: "hot-leads",
      tone: "hot",
      title: `${newHotLeads.length} lead${newHotLeads.length === 1 ? "" : "s"} caliente${newHotLeads.length === 1 ? "" : "s"} nuevo${newHotLeads.length === 1 ? "" : "s"}`,
      description: newHotLeads
        .slice(0, 3)
        .map((l) => l.full_name)
        .join(", "),
      href: "/dashboard/leads",
    });
  }

  // ── Tareas vencidas ──────────────────────────────────────────────────────
  if (input.overdueTasks.length > 0) {
    items.push({
      id: "overdue-tasks",
      tone: "risk",
      title: `${input.overdueTasks.length} tarea${input.overdueTasks.length === 1 ? "" : "s"} vencida${input.overdueTasks.length === 1 ? "" : "s"}`,
      description: input.overdueTasks
        .slice(0, 3)
        .map((t) => t.title)
        .join(", "),
      href: "/dashboard/opportunities",
    });
  }

  // ── Deals en riesgo (mismo cálculo que Pronóstico) ──────────────────────
  const forecast = computeForecast(input.opportunities, input.today);
  if (forecast.atRisk.length > 0) {
    items.push({
      id: "at-risk",
      tone: "risk",
      title: `${forecast.atRisk.length} oportunidad${forecast.atRisk.length === 1 ? "" : "es"} en riesgo`,
      description: "Sin fecha de cierre, vencidas, o poco calificadas para su etapa",
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
      title: `${severeAnomalies.length} anomalía${severeAnomalies.length === 1 ? "" : "s"} de conversión`,
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
        title: `${topPriority.length} cuenta${topPriority.length === 1 ? "" : "s"} en prioridad máxima`,
        description: "Encajan con tu cliente ideal y están mostrando intención real ahora",
        href: "/dashboard/priority",
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
      title: `${behindQuotas.length} cuota${behindQuotas.length === 1 ? "" : "s"} atrasada${behindQuotas.length === 1 ? "" : "s"}`,
      description: "Van más lento de lo que el período ya avanzó",
      href: "/dashboard/team",
    });
  }

  // ── Duplicados por revisar ───────────────────────────────────────────────
  const duplicateGroups = input.companyDuplicates.length + input.leadDuplicates.length;
  if (duplicateGroups > 0) {
    items.push({
      id: "duplicates",
      tone: "info",
      title: `${duplicateGroups} posible${duplicateGroups === 1 ? "" : "s"} duplicado${duplicateGroups === 1 ? "" : "s"}`,
      description: "Entre empresas y contactos — vale la pena fusionarlos",
      href: "/dashboard/companies",
    });
  }

  return items;
}
