import type { Company, Lead, Opportunity } from "@/types/domain";

export interface SearchResult {
  id: string;
  kind: "company" | "opportunity" | "contact";
  title: string;
  subtitle: string;
  href: string;
}

/** Índice de búsqueda simple, armado en el navegador a partir de datos que
 *  ya están cargados — sin llamada a la API adicional ni servicio de
 *  búsqueda aparte. Suficiente para el volumen de datos de una cuenta. */
export function buildSearchIndex({
  companies,
  opportunities,
  leads,
}: {
  companies: Company[];
  opportunities: Opportunity[];
  leads: Lead[];
}): SearchResult[] {
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const companyResults: SearchResult[] = companies.map((c) => ({
    id: `company-${c.id}`,
    kind: "company",
    title: c.name,
    subtitle: [c.industry, c.country].filter(Boolean).join(" · ") || "Empresa",
    href: `/dashboard/companies/${c.id}`,
  }));

  const opportunityResults: SearchResult[] = opportunities.map((o) => {
    const company = o.company_id ? companyById.get(o.company_id) : undefined;
    return {
      id: `opportunity-${o.id}`,
      kind: "opportunity",
      title: o.title.replace(/^Opportunity:\s*/, ""),
      subtitle: company ? company.name : "Oportunidad",
      href: `/dashboard/opportunities/${o.id}`,
    };
  });

  const contactResults: SearchResult[] = leads.map((l) => {
    const company = l.company_id ? companyById.get(l.company_id) : undefined;
    return {
      id: `contact-${l.id}`,
      kind: "contact",
      title: l.full_name,
      subtitle: [l.title, company?.name].filter(Boolean).join(" · ") || "Contacto",
      // Los contactos no tienen ficha propia todavía — se ven dentro de su empresa.
      href: company ? `/dashboard/companies/${company.id}` : "/dashboard/companies",
    };
  });

  return [...companyResults, ...opportunityResults, ...contactResults];
}

export function searchIndex(index: SearchResult[], query: string, limit = 8): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index
    .filter((item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q))
    .slice(0, limit);
}
