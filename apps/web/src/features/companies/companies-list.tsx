"use client";

import { Building2, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { CompanyDuplicatesPanel } from "@/components/dedup/company-duplicates-panel";
import { useCompanies, useCreateCompany } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";

function NewCompanyForm({ onDone }: { onDone: () => void }) {
  const createCompany = useCreateCompany();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createCompany.mutateAsync({
      name: name.trim(),
      domain: domain.trim() || undefined,
      industry: industry.trim() || undefined,
      country: country.trim() || undefined,
    });
    setName("");
    setDomain("");
    setIndustry("");
    setCountry("");
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Nueva empresa
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre *"
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="dominio.com"
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Industria"
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="País"
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || createCompany.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createCompany.isPending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Empresas — la cuenta como unidad, con cuántos contactos y oportunidades tiene cada una. */
export function CompaniesList() {
  const { data: companiesResult, isLoading } = useCompanies(100);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const [showNew, setShowNew] = useState(false);

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

  const exportRows = companies.map((c) => ({
    nombre: c.name,
    dominio: c.domain ?? "",
    industria: c.industry ?? "",
    tamano: c.size ?? "",
    pais: c.country ?? "",
    sitio_web: c.website ?? "",
    contactos: leadCountByCompany.get(c.id) ?? 0,
    oportunidades: oppCountByCompany.get(c.id) ?? 0,
  }));

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
          <div className="flex items-center gap-2">
            <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
            <ExportCsvButton
              rows={exportRows}
              filename="bee-empresas.csv"
              columns={[
                { key: "nombre", header: "Nombre" },
                { key: "dominio", header: "Dominio" },
                { key: "industria", header: "Industria" },
                { key: "tamano", header: "Tamaño" },
                { key: "pais", header: "País" },
                { key: "sitio_web", header: "Sitio web" },
                { key: "contactos", header: "Contactos" },
                { key: "oportunidades", header: "Oportunidades" },
              ]}
            />
            <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary">
              + Nueva empresa
            </button>
          </div>
        </div>
      </header>

      {showNew && <NewCompanyForm onDone={() => setShowNew(false)} />}

      <CompanyDuplicatesPanel />

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
