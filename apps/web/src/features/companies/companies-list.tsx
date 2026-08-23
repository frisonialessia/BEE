"use client";

import { Building2, Globe } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";

/** Empresas — la cuenta como unidad, con cuántos contactos y oportunidades tiene cada una. */
export function CompaniesList() {
  const { data: companiesResult, isLoading } = useCompanies(100);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);

  const companies = companiesResult?.data ?? [];
  const live = companiesResult?.live ?? false;

  const leadCountByCompany = new Map<string, number>();
  for (const lead of leadsResult?.data ?? []) {
    if (!lead.company_id) continue;
    leadCountByCompany.set(lead.company_id, (leadCountByCompany.get(lead.company_id) ?? 0) + 1);
  }
  const oppCountByCompany = new Map<string, number>();
  for (const opp of oppsResult?.data ?? []) {
    if (!opp.company_id) continue;
    oppCountByCompany.set(opp.company_id, (oppCountByCompany.get(opp.company_id) ?? 0) + 1);
  }

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Cuentas</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Empresas</h1>
            <p className="bee-caption mt-1">
              Cada empresa con sus contactos, oportunidades y señales en un solo lugar
            </p>
          </div>
          <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay empresas registradas.</p>
          <p className="bee-caption mt-1">Aparecen automáticamente al llegar señales o leads.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/dashboard/companies/${company.id}`}
              className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]">
                  <Building2 className="size-4 text-[var(--color-chart-4)]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{company.name}</p>
                  {company.domain && (
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Globe className="size-3 shrink-0" />
                      {company.domain}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {company.industry && (
                  <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary)]/60 px-2 py-0.5 text-muted-foreground">
                    {company.industry}
                  </span>
                )}
                {company.country && (
                  <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary)]/60 px-2 py-0.5 text-muted-foreground">
                    {company.country}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-4 border-t border-border pt-2.5 text-xs text-muted-foreground">
                <span>{leadCountByCompany.get(company.id) ?? 0} contactos</span>
                <span>{oppCountByCompany.get(company.id) ?? 0} oportunidades</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
