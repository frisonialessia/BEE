import type { IcpCriteria } from "@/lib/api/organizations";
import type { Company, Lead, Opportunity, Signal } from "@/types/domain";

export type PriorityQuadrant = "priority" | "nurture" | "opportunistic" | "deprioritize";

export const QUADRANT_LABELS: Record<PriorityQuadrant, string> = {
  priority: "Prioridad máxima",
  nurture: "Cultivar",
  opportunistic: "Oportunista",
  deprioritize: "Bajo interés",
};

export const QUADRANT_HINTS: Record<PriorityQuadrant, string> = {
  priority: "Encaja con tu cliente ideal y está mostrando intención real ahora — enfoca aquí primero.",
  nurture: "Encaja con tu cliente ideal pero todavía no está caliente — vale la pena seguirla en el tiempo.",
  opportunistic: "Está caliente pero no es tu cliente ideal — puede cerrar rápido, pero no repitas el patrón.",
  deprioritize: "Ni encaja ni está caliente — no es donde debería ir tu tiempo ahora.",
};

export function isIcpConfigured(criteria: IcpCriteria): boolean {
  return criteria.industries.length > 0 || criteria.sizes.length > 0 || criteria.countries.length > 0;
}

/** Fit 0–100: fracción de las dimensiones que SÍ configuraste (industria,
 *  tamaño, país) que esta empresa cumple. Una dimensión que dejaste vacía no
 *  cuenta ni a favor ni en contra — "no me importa el país" no debería
 *  penalizar a nadie. `null` cuando el ICP todavía no está configurado en
 *  absoluto: nunca inventamos un fit score sin una definición real. */
export function computeFitScore(company: Company, criteria: IcpCriteria): number | null {
  if (!isIcpConfigured(criteria)) return null;

  let dimensions = 0;
  let matches = 0;

  if (criteria.industries.length > 0) {
    dimensions += 1;
    if (company.industry && criteria.industries.includes(company.industry)) matches += 1;
  }
  if (criteria.sizes.length > 0) {
    dimensions += 1;
    if (company.size && criteria.sizes.includes(company.size)) matches += 1;
  }
  if (criteria.countries.length > 0) {
    dimensions += 1;
    if (company.country && criteria.countries.includes(company.country)) matches += 1;
  }

  if (dimensions === 0) return null;
  return Math.round((matches / dimensions) * 100);
}

/** Intent 0–100 para una cuenta: la señal más caliente que tenemos de ella
 *  ahora mismo (el score más alto entre sus oportunidades, leads y señales)
 *  — no un promedio, porque una sola señal fuerte sí debería levantar la
 *  prioridad aunque el resto de la cuenta esté fría. */
export function computeIntentScore(
  companyId: string,
  data: { opportunities: Opportunity[]; leads: Lead[]; signals: Signal[] },
): number {
  const scores = [
    ...data.opportunities.filter((o) => o.company_id === companyId).map((o) => o.score),
    ...data.leads.filter((l) => l.company_id === companyId).map((l) => l.score),
    ...data.signals.filter((s) => s.company_id === companyId).map((s) => s.score),
  ];
  return scores.length > 0 ? Math.max(...scores) : 0;
}

export function classifyQuadrant(fit: number, intent: number, threshold = 50): PriorityQuadrant {
  const highFit = fit >= threshold;
  const highIntent = intent >= threshold;
  if (highFit && highIntent) return "priority";
  if (highFit) return "nurture";
  if (highIntent) return "opportunistic";
  return "deprioritize";
}

export interface CompanyPriority {
  company: Company;
  fit: number;
  intent: number;
  quadrant: PriorityQuadrant;
}

export function computePriorities(
  companies: Company[],
  criteria: IcpCriteria,
  data: { opportunities: Opportunity[]; leads: Lead[]; signals: Signal[] },
): CompanyPriority[] {
  return companies
    .map((company) => {
      const fit = computeFitScore(company, criteria);
      if (fit === null) return null;
      const intent = computeIntentScore(company.id, data);
      return { company, fit, intent, quadrant: classifyQuadrant(fit, intent) };
    })
    .filter((p): p is CompanyPriority => p !== null);
}
