import type { Lead, Opportunity } from "@/types/domain";

/** Niveles de seniority reales que ya usa el resto de BEE (ver
 *  app.services.resource_predictor._SENIOR_LEVELS y
 *  app.services.data_validator para "c_level"/"vp"/"director") — no se
 *  inventa una jerarquía de reporte que BEE no tiene datos para sostener,
 *  solo se agrupa por el cargo real de cada contacto. */
export type SeniorityTier = "c_level" | "vp" | "director" | "manager" | "ic" | "unknown";

const TIER_ORDER: SeniorityTier[] = ["c_level", "vp", "director", "manager", "ic", "unknown"];
const KNOWN_TIERS = new Set<string>(["c_level", "vp", "director", "manager", "ic"]);

export const TIER_LABELS: Record<SeniorityTier, string> = {
  c_level: "C-Level",
  vp: "VP",
  director: "Dirección",
  manager: "Manager",
  ic: "Colaborador/a individual",
  unknown: "Sin clasificar",
};

export type OpportunityLinkStatus = "won" | "lost" | "open" | "none";

export interface RelationshipNode {
  lead: Lead;
  tier: SeniorityTier;
  opportunityStatus: OpportunityLinkStatus;
  /** Solo se llena cuando hay exactamente una oportunidad ligada — con más
   *  de una no hay a cuál navegar sin ambigüedad. */
  singleOpportunityId: string | null;
  opportunityCount: number;
}

export interface RelationshipTierGroup {
  tier: SeniorityTier;
  nodes: RelationshipNode[];
}

const CLOSED_STATUSES = new Set(["won", "lost", "dismissed"]);

/** Mapa de relaciones de una cuenta: sus contactos agrupados por nivel real
 *  (no una jerarquía de reporte inventada) y si cada uno ya está ligado a
 *  una oportunidad ganada/perdida/abierta — para ver de un vistazo si el
 *  comité de compra completo está cubierto o si todo el peso está en una
 *  sola persona. */
export function computeRelationshipMap(
  leads: Lead[],
  opportunities: Opportunity[],
): RelationshipTierGroup[] {
  const oppsByLead = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    if (!o.lead_id) continue;
    const list = oppsByLead.get(o.lead_id) ?? [];
    list.push(o);
    oppsByLead.set(o.lead_id, list);
  }

  function statusFor(opps: Opportunity[]): OpportunityLinkStatus {
    if (opps.length === 0) return "none";
    if (opps.some((o) => o.status === "won")) return "won";
    if (opps.some((o) => !CLOSED_STATUSES.has(o.status))) return "open";
    return "lost";
  }

  const groups = new Map<SeniorityTier, RelationshipNode[]>();
  for (const lead of leads) {
    const tier: SeniorityTier = KNOWN_TIERS.has(lead.seniority ?? "")
      ? (lead.seniority as SeniorityTier)
      : "unknown";
    const opps = oppsByLead.get(lead.id) ?? [];
    const node: RelationshipNode = {
      lead,
      tier,
      opportunityStatus: statusFor(opps),
      singleOpportunityId: opps.length === 1 ? opps[0].id : null,
      opportunityCount: opps.length,
    };
    const list = groups.get(tier) ?? [];
    list.push(node);
    groups.set(tier, list);
  }

  return TIER_ORDER.filter((t) => groups.has(t)).map((tier) => ({
    tier,
    nodes: (groups.get(tier) ?? []).sort((a, b) => a.lead.full_name.localeCompare(b.lead.full_name)),
  }));
}
