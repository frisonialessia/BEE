"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { LeadDuplicatesPanel } from "@/components/dedup/lead-duplicates-panel";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { LiveBadge } from "@/components/live-badge";
import { SavedViewsControl } from "@/components/saved-views/saved-views-control";
import { Skeleton } from "@/components/ui/skeleton";
import { InitialsDisc, RowChip, Td, Th } from "@/features/companies/table-bits";
import { Pill } from "@/features/crm/drawer/primitives";
import { LeadImportPanel } from "@/features/leads/lead-import-panel";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBulkUpdateLeads, useLeads, useValidateLead } from "@/hooks/queries/use-leads";
import { useBulkEnrollLeadsInSequence, useSequences } from "@/hooks/queries/use-sequences";
import { useUsers } from "@/hooks/queries/use-users";
import { usePagination } from "@/hooks/use-pagination";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";
import { formatRelativeTime } from "@/lib/i18n/format";
import { getLeadStatusLabels, getValidationFlagLabels } from "@/lib/format";
import type { Lead, LeadStatus } from "@/types/domain";

type SortKey = "score_desc" | "score_asc" | "recent" | "name";

/** Forma del `config` que se persiste en una vista guardada — ver
 *  SavedViewsControl. Cambiar esta forma no rompe vistas ya guardadas con
 *  la forma anterior: los campos ausentes simplemente no se aplican. */
interface LeadsViewConfig extends Record<string, unknown> {
  query?: string;
  statusFilter?: LeadStatus | "all";
  staleOnly?: boolean;
  sortKey?: SortKey;
}

const SORTERS: Record<SortKey, (a: Lead, b: Lead) => number> = {
  score_desc: (a, b) => b.score - a.score,
  score_asc: (a, b) => a.score - b.score,
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  name: (a, b) => a.full_name.localeCompare(b.full_name),
};

const STATUS_OPTIONS: LeadStatus[] = ["new", "qualified", "engaged", "converted", "disqualified"];
const SORT_OPTIONS: SortKey[] = ["score_desc", "score_asc", "recent", "name"];

/** CSV columns for a leads export — the same shape whether the tab or the
 *  standalone page exports it. */
export function leadsExportColumns(t: (key: string) => string): { key: keyof ReturnType<typeof leadExportRow>; header: string }[] {
  return [
    { key: "nombre", header: t("export.columns.name") },
    { key: "empresa", header: t("export.columns.company") },
    { key: "cargo", header: t("export.columns.title") },
    { key: "email", header: t("export.columns.email") },
    { key: "telefono", header: t("export.columns.phone") },
    { key: "linkedin", header: t("export.columns.linkedin") },
    { key: "estado", header: t("export.columns.status") },
    { key: "intent_score", header: t("export.columns.intentScore") },
    { key: "frescura_datos", header: t("export.columns.dataFreshness") },
    { key: "creado", header: t("export.columns.createdAt") },
  ];
}

export function leadExportRow(l: Lead, companyName: string, statusLabel: string) {
  return {
    nombre: l.full_name,
    empresa: companyName,
    cargo: l.title ?? "",
    email: l.email ?? "",
    telefono: l.phone ?? "",
    linkedin: l.linkedin_url ?? "",
    estado: statusLabel,
    intent_score: Math.round(l.score),
    frescura_datos: Math.round(l.data_freshness_score * 100),
    creado: l.created_at,
  };
}

/**
 * Leads — the people behind the accounts, as one table: who, where, how to
 * reach them, where they came from, who owns them. Filters are toggle
 * pills, the sort a grey filled control, bulk actions a hairline row that
 * appears with a selection. Everything is computed on the client from what
 * is already loaded — no search endpoint, same as the rest of BEE.
 *
 * `showHeader=false` when embedded as the Leads tab of Empresas
 * (companies-list.tsx): the header, the strip and the search box are the
 * page's, handed in through `query`/`onQueryChange`.
 */
export function LeadsDirectory({
  showHeader = true,
  query: externalQuery,
  onQueryChange,
}: {
  showHeader?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
} = {}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("companiesLeads.leadsDirectory");
  const base = useDashboardBase();
  const leadStatusLabels = getLeadStatusLabels(locale);
  const validationFlagLabels = getValidationFlagLabels(locale);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: users } = useUsers();
  const validateLead = useValidateLead();
  const bulkUpdate = useBulkUpdateLeads();
  const { data: sequencesResult } = useSequences();
  const bulkEnroll = useBulkEnrollLeadsInSequence();

  const [internalQuery, setInternalQuery] = useState("");
  const query = externalQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | "">("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkSequence, setBulkSequence] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const currentViewConfig: LeadsViewConfig = { query, statusFilter, staleOnly, sortKey };
  function applyViewConfig(config: LeadsViewConfig) {
    if (config.query !== undefined) setQuery(config.query);
    if (config.statusFilter !== undefined) setStatusFilter(config.statusFilter);
    if (config.staleOnly !== undefined) setStaleOnly(config.staleOnly);
    if (config.sortKey !== undefined) setSortKey(config.sortKey);
  }

  const leadsData = leadsResult?.data;
  const companiesData = companiesResult?.data;
  const live = leadsResult?.live ?? false;
  const loading = leadsLoading || companiesLoading;

  const leads = useMemo(() => leadsData ?? [], [leadsData]);
  const companyById = useMemo(() => new Map((companiesData ?? []).map((c) => [c.id, c])), [companiesData]);
  const userNameById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.full_name])), [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (statusFilter !== "all" && l.status !== statusFilter) return false;
        if (staleOnly && !l.stale_risk && l.validation_flags.length === 0) return false;
        if (!q) return true;
        const company = l.company_id ? companyById.get(l.company_id) : undefined;
        return l.full_name.toLowerCase().includes(q) || (l.email ?? "").toLowerCase().includes(q) || (company?.name ?? "").toLowerCase().includes(q);
      })
      .sort(SORTERS[sortKey]);
  }, [leads, query, statusFilter, staleOnly, sortKey, companyById]);
  const pagination = usePagination(filtered);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allVisibleSelected = filtered.length > 0 && filtered.every((l) => prev.has(l.id));
      return allVisibleSelected ? new Set() : new Set(filtered.map((l) => l.id));
    });
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return;
    await bulkUpdate.mutateAsync({ ids: [...selected], status: bulkStatus });
    setSelected(new Set());
    setBulkStatus("");
  }

  async function applyBulkAssignee() {
    if (!bulkAssignee || selected.size === 0) return;
    await bulkUpdate.mutateAsync({ ids: [...selected], assigned_to_user_id: bulkAssignee });
    setSelected(new Set());
    setBulkAssignee("");
  }

  async function applyBulkSequence() {
    if (!bulkSequence || selected.size === 0) return;
    try {
      const result = await bulkEnroll.mutateAsync({ sequenceId: bulkSequence, leadIds: [...selected] });
      if (result.failed.length === 0) {
        toast.success(t("toasts.enrolledSuccess", { count: result.created.length }));
      } else {
        toast.warning(t("toasts.enrolledPartial", { created: result.created.length, failed: result.failed.length }));
      }
      setSelected(new Set());
      setBulkSequence("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.enrollError"));
    }
  }

  // The standalone strip: how many, how many are hot, how strong on
  // average, how many nobody has touched yet.
  const hotCount = leads.filter((l) => l.score >= 75).length;
  const uncontactedCount = leads.filter((l) => l.status === "new").length;
  const companyCount = new Set(leads.map((l) => l.company_id).filter(Boolean)).size;
  const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;

  const exportRows = filtered.map((l) => {
    const company = l.company_id ? companyById.get(l.company_id) : undefined;
    return leadExportRow(l, company?.name ?? "", leadStatusLabels[l.status]);
  });

  function sourceLabel(source: string): string {
    return t.has(`table.sources.${source}`) ? t(`table.sources.${source}`) : source;
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  return (
    <div>
      {showHeader && (
        <header className="bee-page-head mb-6">
          <div className="min-w-0">
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h1 className="bee-display mt-1 truncate">{t("title")}</h1>
            <p className="bee-caption mt-1 line-clamp-2">{t("subtitle")}</p>
          </div>
          <div className="bee-page-head__side">
            <div className="bee-page-head__actions">
              <LiveBadge live={live} />
              <div className="w-full sm:w-56">
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("filters.searchPlaceholder")} aria-label={t("filters.searchPlaceholder")} className="bee-input" />
              </div>
              <button type="button" onClick={() => setImportOpen(true)} className="bee-btn-ghost">
                <Upload className="size-3.5" />
                {t("importButton")}
              </button>
            </div>
          </div>
        </header>
      )}

      <LeadImportPanel open={importOpen} onClose={() => setImportOpen(false)} />

      {showHeader && !loading && leads.length > 0 && (
        <div className="mb-6">
          <StatStrip cols={4}>
            <StatTile label={t("metrics.total")} value={leads.length} hint={t("metrics.totalHint", { count: companyCount })} tone={TONE.market} />
            <StatTile label={t("metrics.hot")} value={hotCount} progress={hotCount / leads.length} tone={TONE.urgency} />
            <StatTile label={t("metrics.avgScore")} value={avgScore} progress={avgScore / 100} tone={TONE.forecast} />
            <StatTile label={t("metrics.uncontacted")} value={uncontactedCount} progress={uncontactedCount / leads.length} tone={TONE.prepared} />
          </StatStrip>
        </div>
      )}

      <div className="bee-overview">
        <OverviewCard
          span={12}
          title={t("table.title")}
          caption={query || statusFilter !== "all" || staleOnly ? t("table.captionFiltered", { count: filtered.length, total: leads.length }) : t("table.caption", { count: leads.length })}
          action={<ExportCsvButton rows={exportRows} filename="bee-leads.csv" columns={leadsExportColumns(t)} />}
        >
          {loading ? (
            <Skeleton className="h-64" />
          ) : leads.length === 0 ? (
            <p className="bee-caption py-8 text-center">
              {t("empty.title")} {t("empty.subtitle")}
            </p>
          ) : (
            <>
              {/* Filters: status as toggle pills, sort as the grey control, hygiene as one pill, saved views. */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Pill pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                  {t("filters.allStatuses")}
                </Pill>
                {STATUS_OPTIONS.map((s) => (
                  <Pill key={s} pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
                    {leadStatusLabels[s]}
                  </Pill>
                ))}
                <Pill pressed={staleOnly} onClick={() => setStaleOnly((v) => !v)}>
                  {t("filters.staleOnlyLabel")}
                </Pill>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="bee-caption whitespace-nowrap">{t("filters.sortLabel")}</span>
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="bee-input w-auto">
                      {SORT_OPTIONS.map((k) => (
                        <option key={k} value={k}>
                          {t(`filters.${k === "score_desc" ? "sortScoreDesc" : k === "score_asc" ? "sortScoreAsc" : k === "recent" ? "sortRecent" : "sortName"}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SavedViewsControl page="leads" currentConfig={currentViewConfig} onApply={applyViewConfig} />
                </div>
              </div>

              {selected.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 border-y border-[var(--color-divider)] py-3">
                  <p className="text-sm font-medium">{t("bulk.selected", { count: selected.size })}</p>
                  <div className="flex items-center gap-2">
                    <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus | "")} className="bee-input w-auto" aria-label={t("bulk.changeStatusTo")}>
                      <option value="">{t("bulk.changeStatusTo")}</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {leadStatusLabels[s]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={applyBulkStatus} disabled={!bulkStatus || bulkUpdate.isPending} className="bee-btn bee-btn--primary">
                      {t("bulk.apply")}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className="bee-input w-auto" aria-label={t("bulk.reassignTo")}>
                      <option value="">{t("bulk.reassignTo")}</option>
                      {(users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={applyBulkAssignee} disabled={!bulkAssignee || bulkUpdate.isPending} className="bee-btn bee-btn--primary">
                      {t("bulk.apply")}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={bulkSequence} onChange={(e) => setBulkSequence(e.target.value)} className="bee-input w-auto" aria-label={t("bulk.sendToSequence")}>
                      <option value="">{t("bulk.sendToSequence")}</option>
                      {(sequencesResult?.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={applyBulkSequence} disabled={!bulkSequence || bulkEnroll.isPending} className="bee-btn bee-btn--primary">
                      {bulkEnroll.isPending ? t("bulk.sending") : t("bulk.apply")}
                    </button>
                  </div>
                  <button type="button" onClick={() => setSelected(new Set())} className="bee-btn-ghost ml-auto">
                    {t("bulk.cancelSelection")}
                  </button>
                </div>
              )}

              {filtered.length === 0 ? (
                <p className="bee-caption py-8 text-center">{t("table.noMatch")}</p>
              ) : (
                <>
                  <div className="bee-fill overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr>
                          <Th className="w-8">
                            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-[var(--color-chart-4)]" aria-label={t("table.selectAllVisible")} />
                          </Th>
                          <Th>{t("table.headers.name")}</Th>
                          <Th>{t("table.headers.company")}</Th>
                          <Th>{t("table.headers.email")}</Th>
                          <Th>{t("table.headers.source")}</Th>
                          <Th>{t("table.headers.owner")}</Th>
                          <Th align="right">{t("table.headers.data")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageItems.map((lead) => {
                          const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
                          const hasIssues = lead.validation_flags.length > 0 || lead.stale_risk;
                          const owner = lead.assigned_to_user_id ? userNameById.get(lead.assigned_to_user_id) : undefined;
                          const issueTitle = [...lead.validation_flags.map((f) => validationFlagLabels[f] ?? f), ...(lead.stale_risk ? [t("table.staleWarning")] : [])].join(" · ");
                          return (
                            <tr key={lead.id} className="border-b border-[var(--color-divider)] transition-colors last:border-b-0 hover:bg-[var(--color-primary)]/20">
                              <Td>
                                <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} className="accent-[var(--color-chart-4)]" aria-label={t("table.selectRow", { name: lead.full_name })} />
                              </Td>
                              <Td>
                                <div className="flex min-w-0 items-center gap-3">
                                  <InitialsDisc name={lead.full_name} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{lead.full_name}</p>
                                    <p className="bee-caption truncate">{lead.title ?? t("table.noTitle")}</p>
                                  </div>
                                </div>
                              </Td>
                              <Td>
                                {company ? (
                                  <Link href={`${base}/companies/${company.id}`} className="block truncate hover:underline">
                                    {company.name}
                                  </Link>
                                ) : (
                                  <span className="bee-caption">—</span>
                                )}
                              </Td>
                              <Td>{lead.email ? <span className="block truncate">{lead.email}</span> : <span className="bee-caption">—</span>}</Td>
                              <Td>{lead.source ? <RowChip>{sourceLabel(lead.source)}</RowChip> : <span className="bee-caption">—</span>}</Td>
                              <Td>{owner ? <span className="block truncate">{owner}</span> : <span className="bee-caption">{t("table.unassigned")}</span>}</Td>
                              <Td align="right">
                                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                  <span className="bee-micro" title={hasIssues ? issueTitle : undefined}>
                                    {hasIssues
                                      ? lead.validation_flags.length > 0
                                        ? t("table.issues", { count: lead.validation_flags.length })
                                        : t("table.outdated")
                                      : lead.last_validated_at
                                        ? t("table.validatedAgo", { timeAgo: formatRelativeTime(lead.last_validated_at, locale) })
                                        : t("table.notValidated")}
                                  </span>
                                  <button type="button" onClick={() => validateLead.mutate(lead.id)} disabled={validateLead.isPending} className="bee-btn-text bee-micro h-auto px-1" title={t("table.validateTitle")}>
                                    {t("table.validate")}
                                  </button>
                                </div>
                              </Td>
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
                    itemLabel={t("table.itemLabel")}
                  />
                </>
              )}
            </>
          )}
        </OverviewCard>

        <LeadDuplicatesPanel />
      </div>
    </div>
  );
}
