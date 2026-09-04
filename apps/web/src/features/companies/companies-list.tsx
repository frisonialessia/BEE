"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { CompanyDuplicatesPanel } from "@/components/dedup/company-duplicates-panel";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { LiveBadge } from "@/components/live-badge";
import { LookalikesPanel } from "@/components/lookalikes/lookalikes-panel";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { LeadImportPanel } from "@/features/leads/lead-import-panel";
import { LeadsDirectory } from "@/features/leads/leads-directory";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import { usePagination } from "@/hooks/use-pagination";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";
import { getSignalTypeLabels } from "@/lib/format";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { Signal } from "@/types/domain";

import { IndustryBars } from "./industry-bars";
import { InitialsDisc, RowChip, Td, Th } from "./table-bits";

/** "Con señal en 30 días" — the window that makes a signal still worth
 * acting on, for the strip's third tile. */
const RECENT_SIGNAL_WINDOW_DAYS = 30;
const OPEN_STATUSES_EXCLUDED = ["won", "lost", "dismissed"];

/**
 * Empresas — the account book in one page, two tabs: Directorio (the
 * companies as a table, the top industries beside it) and Leads (the
 * people). One strip of four tiles serves both tabs. Anything created here
 * — a company, a lead, an opportunity — goes through the CRM's own drawer
 * (`openNew`), never a second form.
 */
export function CompaniesList() {
  const t = useTranslations("companiesLeads.companiesList");
  const tLeads = useTranslations("companiesLeads.leadsDirectory");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const base = useDashboardBase();
  const { openNew } = useOpportunityDrawer();
  const { data: companiesResult, isLoading } = useCompanies(100);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: signalsResult } = useSignals(200);
  const { data: users } = useUsers();
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Read the clock once per mount, same as company-detail/crm-board — the
  // React Compiler treats Date.now() in render as impure.
  const [nowMs] = useState(() => Date.now());

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const leads = useMemo(() => leadsResult?.data ?? [], [leadsResult]);
  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const signals = useMemo(() => signalsResult?.data ?? [], [signalsResult]);
  const live = companiesResult?.live ?? false;
  const signalTypeLabels = getSignalTypeLabels(locale);
  const userNameById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.full_name])), [users]);

  // Per-company counts and the latest signal, computed once from what the
  // page already loaded — no search endpoint, same as the rest of BEE.
  const perCompany = useMemo(() => {
    const leadCount = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.company_id) continue;
      leadCount.set(lead.company_id, (leadCount.get(lead.company_id) ?? 0) + 1);
    }
    const oppCount = new Map<string, number>();
    const openOppCount = new Map<string, number>();
    for (const opp of opportunities) {
      if (!opp.company_id) continue;
      oppCount.set(opp.company_id, (oppCount.get(opp.company_id) ?? 0) + 1);
      if (!OPEN_STATUSES_EXCLUDED.includes(opp.status)) openOppCount.set(opp.company_id, (openOppCount.get(opp.company_id) ?? 0) + 1);
    }
    const lastSignal = new Map<string, Signal>();
    for (const signal of signals) {
      if (!signal.company_id) continue;
      const current = lastSignal.get(signal.company_id);
      if (!current || new Date(signal.detected_at).getTime() > new Date(current.detected_at).getTime()) lastSignal.set(signal.company_id, signal);
    }
    return { leadCount, oppCount, openOppCount, lastSignal };
  }, [leads, opportunities, signals]);

  // The strip: how many accounts, how many people, how many accounts moved
  // in the last 30 days, how many people nobody owns yet.
  const strip = useMemo(() => {
    const cutoff = nowMs - RECENT_SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recentlySignaled = new Set<string>();
    for (const signal of signals) {
      if (signal.company_id && new Date(signal.detected_at).getTime() >= cutoff) recentlySignaled.add(signal.company_id);
    }
    const withRecentSignal = companies.filter((c) => recentlySignaled.has(c.id)).length;
    const unowned = leads.filter((l) => !l.assigned_to_user_id).length;
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const to = nowMs - (7 - i) * 7 * 86_400_000;
      return signals.filter((s) => {
        const d = new Date(s.detected_at).getTime();
        return d >= to - 7 * 86_400_000 && d < to;
      }).length;
    });
    return { withRecentSignal, unowned, weekly };
  }, [companies, leads, signals, nowMs]);

  // Top five industries, ranked — the honey bars beside the table.
  const industries = useMemo(() => {
    const byIndustry = new Map<string, number>();
    for (const c of companies) if (c.industry) byIndustry.set(c.industry, (byIndustry.get(c.industry) ?? 0) + 1);
    return [...byIndustry.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => [c.name, c.domain, c.industry, c.country].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [companies, query]);
  const pagination = usePagination(filtered);

  const exportRows = companies.map((c) => ({
    nombre: c.name,
    dominio: c.domain ?? "",
    industria: c.industry ?? "",
    tamano: c.size ?? "",
    pais: c.country ?? "",
    sitio_web: c.website ?? "",
    contactos: perCompany.leadCount.get(c.id) ?? 0,
    oportunidades: perCompany.oppCount.get(c.id) ?? 0,
  }));

  const hasIndustries = industries.length > 0;

  return (
    <div>
      <MergedPageTabs
        defaultValue="companies"
        header={
          <div className="min-w-0">
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1 truncate">{t("title")}</h1>
            <p className="bee-caption mt-1 line-clamp-2">{t("subtitle")}</p>
          </div>
        }
        actions={
          <>
            <LiveBadge live={live} />
            <div className="w-44 sm:w-56">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="bee-input" />
            </div>
            <button type="button" onClick={() => setImportOpen(true)} className="bee-btn-ghost">
              <Upload className="size-3.5" />
              {t("importButton")}
            </button>
          </>
        }
        actionsByTab={{
          companies: (
            <button type="button" onClick={() => openNew()} className="bee-btn bee-btn--primary">
              {t("newButton")}
            </button>
          ),
          leads: (
            <button type="button" onClick={() => openNew()} className="bee-btn bee-btn--primary">
              {tLeads("newLeadButton")}
            </button>
          ),
        }}
        belowTabs={
          isLoading ? (
            <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
              ))}
            </div>
          ) : (
            <StatStrip cols={4}>
              <StatTile label={t("portfolio.total")} value={companies.length} hint={t("portfolio.totalHint")} tone={TONE.market} />
              <StatTile label={tLeads("metrics.total")} value={leads.length} hint={tLeads("metrics.totalHint", { count: new Set(leads.map((l) => l.company_id).filter(Boolean)).size })} tone={TONE.forecast} />
              <StatTile label={t("portfolio.withRecentSignal")} value={strip.withRecentSignal} trend={strip.weekly} hint={t("portfolio.withRecentSignalHint")} tone={TONE.urgency} />
              <StatTile label={tLeads("metrics.unowned")} value={strip.unowned} progress={leads.length > 0 ? strip.unowned / leads.length : 0} tone={TONE.prepared} />
            </StatStrip>
          )
        }
        tabs={[
          {
            value: "companies",
            label: t("outerTabs.companies"),
            content: (
              <div className="bee-overview">
                <OverviewCard
                  span={12}
                  title={t("directory.title")}
                  caption={query ? t("directory.captionFiltered", { count: filtered.length, total: companies.length }) : t("directory.caption", { count: companies.length })}
                  action={
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
                  }
                >
                  {isLoading ? (
                    <Skeleton className="h-64" />
                  ) : companies.length === 0 ? (
                    <p className="bee-caption py-8 text-center">{t("empty.title")} {t("empty.subtitle")}</p>
                  ) : filtered.length === 0 ? (
                    <p className="bee-caption py-8 text-center">{t("directory.noMatch")}</p>
                  ) : (
                    <>
                      <div className="bee-fill overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                          <thead>
                            <tr>
                              <Th>{t("directory.headers.company")}</Th>
                              <Th>{t("directory.headers.industry")}</Th>
                              <Th>{t("directory.headers.lastSignal")}</Th>
                              <Th align="right">{t("directory.headers.openOpportunities")}</Th>
                              <Th>{t("directory.headers.owner")}</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagination.pageItems.map((company) => {
                              const href = `${base}/companies/${company.id}`;
                              const last = perCompany.lastSignal.get(company.id);
                              const owner = company.owner_user_id ? userNameById.get(company.owner_user_id) : undefined;
                              return (
                                // The whole row opens the account; the name is a real link for keyboards.
                                <tr key={company.id} onClick={() => router.push(href)} className="cursor-pointer border-b border-[var(--color-divider)] transition-colors last:border-b-0 hover:bg-[var(--color-primary)]/20">
                                  <Td>
                                    <div className="flex min-w-0 items-center gap-3">
                                      <InitialsDisc name={company.name} />
                                      <div className="min-w-0">
                                        <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                                          {company.name}
                                        </Link>
                                        {company.domain && <p className="bee-caption truncate">{company.domain}</p>}
                                      </div>
                                    </div>
                                  </Td>
                                  <Td>
                                    <span className="block truncate">{company.industry ?? "—"}</span>
                                  </Td>
                                  <Td>
                                    {last ? (
                                      <div className="flex min-w-0 items-center gap-2">
                                        <RowChip hue={TONE.market} level={45}>
                                          {signalTypeLabels[last.signal_type] ?? last.signal_type}
                                        </RowChip>
                                        <span className="bee-micro shrink-0">{formatRelativeTime(last.detected_at, locale)}</span>
                                      </div>
                                    ) : (
                                      <span className="bee-caption">—</span>
                                    )}
                                  </Td>
                                  <Td align="right">
                                    <span className="tabular-nums">{perCompany.openOppCount.get(company.id) ?? 0}</span>
                                  </Td>
                                  <Td>{owner ? <span className="block truncate">{owner}</span> : <span className="bee-caption">{t("directory.unassigned")}</span>}</Td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <PaginationBar
                        page={pagination.page}
                        pageSize={pagination.pageSize}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
                        onPageChange={pagination.goToPage}
                        onPageSizeChange={pagination.changePageSize}
                        itemLabel={t("directory.itemLabel")}
                      />
                    </>
                  )}
                </OverviewCard>

                {hasIndustries && (
                  <OverviewCard span={12} title={t("portfolio.industryTitle")} caption={t("portfolio.industryCaption")} bodyClassName="max-w-3xl">
                    <IndustryBars rows={industries} tone={TONE.market} />
                  </OverviewCard>
                )}

                <LookalikesPanel />
                <CompanyDuplicatesPanel />
              </div>
            ),
          },
          { value: "leads", label: t("outerTabs.leads"), content: <LeadsDirectory showHeader={false} query={query} onQueryChange={setQuery} /> },
        ]}
      />
      <LeadImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
