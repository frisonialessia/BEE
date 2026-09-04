"use client";

import { Building2, Globe, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { CompanyDuplicatesPanel } from "@/components/dedup/company-duplicates-panel";
import { LookalikesPanel } from "@/components/lookalikes/lookalikes-panel";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { LeadImportPanel } from "@/features/leads/lead-import-panel";
import { LeadsDirectory, leadExportRow, leadsExportColumns } from "@/features/leads/leads-directory";
import type { Locale } from "@/i18n/locales";
import { getLeadStatusLabels } from "@/lib/format";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useIsDemoMode } from "@/lib/demo/mode";
import { LiveBadge } from "@/components/live-badge";

/** "Con señal en 30 días" — the window that makes a signal still worth
 * acting on, for the Directorio strip's fourth tile. */
const RECENT_SIGNAL_WINDOW_DAYS = 30;


/** Empresas — la cuenta como unidad, con cuántos contactos y oportunidades tiene cada una. */
/** Companies — the primary tab of the merged Companies+Leads page; Leads
 * (LeadsDirectory, showHeader={false}) is the second tab below. Two
 * account-record entities, previously two sidebar rows — see
 * lib/nav-items.ts. /dashboard/leads still exists as a redirect to
 * ?tab=leads, so no old link/bookmark breaks. */
import { Donut } from "@/components/charts/donut";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, mix } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";

export function CompaniesList() {
  const t = useTranslations("companiesLeads.companiesList");
  const { data: companiesResult, isLoading } = useCompanies(100);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: signalsResult } = useSignals(200);
  const { openNew } = useOpportunityDrawer();
  const [importOpen, setImportOpen] = useState(false);
  const tLeads = useTranslations("companiesLeads.leadsDirectory");
  const demo = useIsDemoMode();
  // Read the clock once per mount, same as company-detail/crm-board — the
  // React Compiler treats Date.now() in render as impure.
  const [nowMs] = useState(() => Date.now());

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

  // The directory at a glance — where the accounts are, before the list.
  const portfolio = useMemo(() => {
    const byIndustry = new Map<string, number>();
    const byCountry = new Map<string, number>();
    for (const c of companies) {
      if (c.industry) byIndustry.set(c.industry, (byIndustry.get(c.industry) ?? 0) + 1);
      if (c.country) byCountry.set(c.country, (byCountry.get(c.country) ?? 0) + 1);
    }
    const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const withOpps = companies.filter((c) => (oppCountByCompany.get(c.id) ?? 0) > 0).length;
    const withContacts = companies.filter((c) => (leadCountByCompany.get(c.id) ?? 0) > 0).length;
    // Accounts with something recent to act on: at least one signal
    // detected in the last 30 days.
    const cutoff = nowMs - RECENT_SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recentlySignaled = new Set<string>();
    for (const signal of signalsResult?.data ?? []) {
      if (signal.company_id && new Date(signal.detected_at).getTime() >= cutoff) {
        recentlySignaled.add(signal.company_id);
      }
    }
    const withRecentSignal = companies.filter((c) => recentlySignaled.has(c.id)).length;
    return {
      industries: [...byIndustry.entries()].map(([label, value]) => ({ label, value })),
      // One color per box: indigo at three strengths by rank.
      countries: countries.map(([label, value], i) => ({ label, value, color: i === 0 ? DATA.indigo : mix(DATA.indigo, i < 3 ? 75 : 50) })),
      withOpps,
      withContacts,
      withRecentSignal,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the count maps are rebuilt each render from the same query data
  }, [companies, leadsResult, oppsResult, signalsResult, nowMs]);

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

  const locale = useLocale() as Locale;
  const leadStatusLabels = getLeadStatusLabels(locale);
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const leadExportRows = (leadsResult?.data ?? []).map((l) =>
    leadExportRow(l, l.company_id ? companyNameById.get(l.company_id) ?? "" : "", leadStatusLabels[l.status]),
  );

  return (
    <div>
      {/* BEE standard: header and tabs share one row, each tab's own
          controls (export, import) sit at its right end, and the KPI strip
          starts right below — at the same height as on every other page. */}
      <MergedPageTabs
        defaultValue="companies"
        header={
          <header>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1">{t("title")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </header>
        }
        actions={
          <>
            <LiveBadge live={live} />
            {/* One way to add anyone, anywhere in BEE: the same "Nueva
                oportunidad" window the CRM uses (company + contact + deal
                in one flow) — never a second form per page. */}
            <button type="button" onClick={() => openNew()} className="bee-btn bee-btn--primary">
              {tLeads("newLeadButton")}
            </button>
          </>
        }
        actionsByTab={{
          companies: (
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
          ),
          leads: (
            <>
              <button type="button" onClick={() => setImportOpen(true)} className="bee-btn-ghost inline-flex items-center gap-2">
                <Upload className="size-3.5" />
                {tLeads("importButton")}
              </button>
              <ExportCsvButton rows={leadExportRows} filename="bee-leads.csv" columns={leadsExportColumns(tLeads)} />
            </>
          ),
        }}
        tabs={[
          {
            value: "companies",
            label: t("outerTabs.companies"),
            content: (
              <>
                {companies.length > 0 && (
                  <div className="mb-4 space-y-4">
                    {/* Four tiles, one hue each, same strip as the Leads tab:
                        indigo = volume, violet = readiness (an opportunity
                        exists), magenta = coverage (a contact exists),
                        honey = hot (a signal fired recently). */}
                    <StatStrip cols={4}>
                      <StatTile label={t("portfolio.total")} value={companies.length} hint={t("portfolio.totalHint")} tone={DATA.indigo} />
                      <StatTile label={t("portfolio.withOpps")} value={portfolio.withOpps} progress={portfolio.withOpps / companies.length} tone={DATA.violet} />
                      <StatTile label={t("portfolio.withContacts")} value={portfolio.withContacts} progress={portfolio.withContacts / companies.length} tone={DATA.magenta} />
                      <StatTile label={t("portfolio.withRecentSignal")} value={portfolio.withRecentSignal} progress={portfolio.withRecentSignal / companies.length} tone={DATA.honey} />
                    </StatStrip>
                    <div className="bee-overview">
                      <OverviewCard span={5} title={t("portfolio.industryTitle")} caption={t("portfolio.industryCaption")}>
                        <Donut slices={portfolio.industries} otherLabel={t("portfolio.other")} />
                      </OverviewCard>
                      <OverviewCard span={7} title={t("portfolio.countryTitle")} caption={t("portfolio.countryCaption")}>
                        {portfolio.countries.length === 0 ? (
                          <p className="bee-caption py-6 text-center">—</p>
                        ) : (
                          <HorizontalFunnel rows={portfolio.countries} />
                        )}
                      </OverviewCard>
                    </div>
                  </div>
                )}

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
      <LeadImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
