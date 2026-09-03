"use client";

import { Building2, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { CompanyDuplicatesPanel } from "@/components/dedup/company-duplicates-panel";
import { LookalikesPanel } from "@/components/lookalikes/lookalikes-panel";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { LeadsDirectory } from "@/features/leads/leads-directory";
import { useCompanies, useCreateCompany } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useIsDemoMode } from "@/lib/demo/mode";
import { LiveBadge } from "@/components/live-badge";

function NewCompanyForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("companiesLeads.companiesList.newCompanyForm");
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
        {t("heading")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder={t("domainPlaceholder")}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder={t("industryPlaceholder")}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder={t("countryPlaceholder")}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || createCompany.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createCompany.isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/** Empresas — la cuenta como unidad, con cuántos contactos y oportunidades tiene cada una. */
/** Companies — the primary tab of the merged Companies+Leads page; Leads
 * (LeadsDirectory, showHeader={false}) is the second tab below. Two
 * account-record entities, previously two sidebar rows — see
 * lib/nav-items.ts. /dashboard/leads still exists as a redirect to
 * ?tab=leads, so no old link/bookmark breaks. */
export function CompaniesList() {
  const t = useTranslations("companiesLeads.companiesList");
  const { data: companiesResult, isLoading } = useCompanies(100);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const [showNew, setShowNew] = useState(false);
  const demo = useIsDemoMode();

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
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LiveBadge live={live} />
            {!demo && (
              <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary">
                {t("newCompanyButton")}
              </button>
            )}
          </div>
        </div>
      </header>

      <MergedPageTabs
        defaultValue="companies"
        tabs={[
          {
            value: "companies",
            label: t("outerTabs.companies"),
            content: (
              <>
                {/* The export is this tab's — the Leads tab has its own — so
                    a page never shows two "Exportar CSV" buttons at once. */}
                <div className="mb-3 flex justify-end">
                  <ExportCsvButton
                    rows={exportRows}
                    filename="bee-empresas.csv"
                    columns={[
                      { key: "nombre", header: t("export.columns.name") },
                      { key: "dominio", header: t("export.columns.domain") },
                      { key: "industria", header: t("export.columns.industry") },
                      { key: "tamano", header: t("export.columns.size") },
                      { key: "pais", header: t("export.columns.country") },
                      { key: "sitio_web", header: t("export.columns.website") },
                      { key: "contactos", header: t("export.columns.contacts") },
                      { key: "oportunidades", header: t("export.columns.opportunities") },
                    ]}
                  />
                </div>
                {showNew && <NewCompanyForm onDone={() => setShowNew(false)} />}

                <LookalikesPanel />
                <CompanyDuplicatesPanel />

                {isLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : companies.length === 0 ? (
                  <div className="bee-bento bee-bento-pad py-8 text-center">
                    <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
                    <p className="bee-caption mt-1">{t("empty.subtitle")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {companies.map((company) => {
            const cardContent = (
              <>
                <div className="flex items-center gap-4">
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

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {company.industry && (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary)]/60 px-2 py-1 text-muted-foreground">
                      {company.industry}
                    </span>
                  )}
                  {company.country && (
                    <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary)]/60 px-2 py-1 text-muted-foreground">
                      {company.country}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{leadCountByCompany.get(company.id) ?? 0} {t("card.contacts")}</span>
                  <span>{oppCountByCompany.get(company.id) ?? 0} {t("card.opportunities")}</span>
                </div>
              </>
            );

            return (
              <Link
                key={company.id}
                href={`${demo ? "/probar" : "/dashboard"}/companies/${company.id}`}
                className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]"
              >
                {cardContent}
              </Link>
            );
          })}
                  </div>
                )}
              </>
            ),
          },
          { value: "leads", label: t("outerTabs.leads"), content: <LeadsDirectory showHeader={false} /> },
        ]}
      />
    </div>
  );
}
