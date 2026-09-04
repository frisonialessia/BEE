"use client";

import { RefreshCw, Search, Upload, Workflow } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { DATA } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { LeadDuplicatesPanel } from "@/components/dedup/lead-duplicates-panel";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { SavedViewsControl } from "@/components/saved-views/saved-views-control";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadImportPanel } from "@/features/leads/lead-import-panel";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBulkUpdateLeads, useLeads, useValidateLead } from "@/hooks/queries/use-leads";
import { useBulkEnrollLeadsInSequence, useSequences } from "@/hooks/queries/use-sequences";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { useIsDemoMode } from "@/lib/demo/mode";
import { formatRelativeTime } from "@/lib/i18n/format";
import { getLeadStatusLabels, getValidationFlagLabels, scoreVariant } from "@/lib/format";
import type { Lead, LeadStatus } from "@/types/domain";
import { LiveBadge } from "@/components/live-badge";

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

/** Directorio central de leads — el centro de operaciones para saber a quién
 *  enfocar cada día: intent score, filtros, búsqueda y exportación completa.
 *  Todo se calcula en el cliente a partir de lo que ya está cargado, mismo
 *  patrón que el resto de la BI de BEE — sin endpoint de búsqueda aparte. */
/** `showHeader=false` when embedded as a tab of the merged Companies page
 * (see companies-list.tsx) — the live/demo badge, import, and CSV export
 * actions stay either way. */
/** CSV columns for a leads export — shared with companies-list.tsx, which
 *  hosts the Leads tab's export button in the page's tabs row. */
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

export function LeadsDirectory({ showHeader = true }: { showHeader?: boolean } = {}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("companiesLeads.leadsDirectory");
  const leadStatusLabels = getLeadStatusLabels(locale);
  const validationFlagLabels = getValidationFlagLabels(locale);
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: users } = useUsers();
  const validateLead = useValidateLead();
  const bulkUpdate = useBulkUpdateLeads();
  const demo = useIsDemoMode();
  const { data: sequencesResult } = useSequences();
  const bulkEnroll = useBulkEnrollLeadsInSequence();

  const [query, setQuery] = useState("");
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
  const companyById = useMemo(
    () => new Map((companiesData ?? []).map((c) => [c.id, c])),
    [companiesData],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (statusFilter !== "all" && l.status !== statusFilter) return false;
        if (staleOnly && !l.stale_risk && l.validation_flags.length === 0) return false;
        if (!q) return true;
        const company = l.company_id ? companyById.get(l.company_id) : undefined;
        return (
          l.full_name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (company?.name ?? "").toLowerCase().includes(q)
        );
      })
      .sort(SORTERS[sortKey]);
  }, [leads, query, statusFilter, staleOnly, sortKey, companyById]);

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
        toast.warning(
          t("toasts.enrolledPartial", { created: result.created.length, failed: result.failed.length }),
        );
      }
      setSelected(new Set());
      setBulkSequence("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.enrollError"));
    }
  }

  // The strip at a glance: how many, how many are hot, how strong on
  // average, how many nobody has touched yet. "Stale/incomplete" stays as
  // the filter toggle below — it's a hygiene action, not a headline number.
  const hotCount = leads.filter((l) => l.score >= 75).length;
  const uncontactedCount = leads.filter((l) => l.status === "new").length;
  const companyCount = new Set(leads.map((l) => l.company_id).filter(Boolean)).size;
  const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;

  const exportRows = filtered.map((l) => {
    const company = l.company_id ? companyById.get(l.company_id) : undefined;
    return {
      nombre: l.full_name,
      empresa: company?.name ?? "",
      cargo: l.title ?? "",
      email: l.email ?? "",
      telefono: l.phone ?? "",
      linkedin: l.linkedin_url ?? "",
      estado: leadStatusLabels[l.status],
      intent_score: Math.round(l.score),
      frescura_datos: Math.round(l.data_freshness_score * 100),
      creado: l.created_at,
    };
  });

  return (
    <div>
      {/* Embedded in the Companies page the header and the import/export
          controls live in that page's tabs row (companies-list.tsx), so the
          KPI strip starts at the standard height on both tabs. */}
      {showHeader && (
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="bee-display">{t("title")}</h1>
            <p className="bee-caption mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LiveBadge live={live} />
            <button type="button" onClick={() => setImportOpen(true)} className="bee-btn-ghost inline-flex items-center gap-2">
              <Upload className="size-3.5" />
              {t("importButton")}
            </button>
            <ExportCsvButton
              rows={exportRows}
              filename="bee-leads.csv"
              columns={[
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
              ]}
            />
          </div>
        </div>
      </header>
      )}

      <LeadDuplicatesPanel />
      <LeadImportPanel open={importOpen} onClose={() => setImportOpen(false)} />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
          <p className="bee-caption mt-1">{t("empty.subtitle")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Same tile, same hue-per-meaning as the Directorio tab's strip:
              indigo = volume, honey = hot/high intent, magenta = score,
              violet = readiness. Every tile carries a ring or a hint so the
              four are the same height. */}
          <StatStrip cols={4}>
            <StatTile
              label={t("metrics.total")}
              value={leads.length}
              hint={t("metrics.totalHint", { count: companyCount })}
              tone={DATA.indigo}
            />
            <StatTile label={t("metrics.hot")} value={hotCount} progress={hotCount / leads.length} tone={DATA.honey} />
            <StatTile label={t("metrics.avgScore")} value={avgScore} progress={avgScore / 100} tone={DATA.magenta} />
            <StatTile
              label={t("metrics.uncontacted")}
              value={uncontactedCount}
              progress={uncontactedCount / leads.length}
              tone={DATA.violet}
            />
          </StatStrip>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-full border border-border bg-[var(--color-card)]/60 px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
              className="rounded-full border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              <option value="all">{t("filters.allStatuses")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {leadStatusLabels[s]}
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-full border border-border bg-[var(--color-card)] px-3 py-2 text-xs outline-none"
            >
              <option value="score_desc">{t("filters.sortScoreDesc")}</option>
              <option value="score_asc">{t("filters.sortScoreAsc")}</option>
              <option value="recent">{t("filters.sortRecent")}</option>
              <option value="name">{t("filters.sortName")}</option>
            </select>
            <Label className="text-xs font-normal text-muted-foreground">
              <Checkbox checked={staleOnly} onCheckedChange={(checked) => setStaleOnly(checked === true)} />
              {t("filters.staleOnlyLabel")}
            </Label>
            <SavedViewsControl page="leads" currentConfig={currentViewConfig} onApply={applyViewConfig} />
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 px-4 py-3">
              <p className="text-xs font-medium">
                {t("bulk.selected", { count: selected.size })}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as LeadStatus | "")}
                  className="rounded-full border border-border bg-[var(--color-card)] px-3 py-1 text-xs outline-none"
                >
                  <option value="">{t("bulk.changeStatusTo")}</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {leadStatusLabels[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkStatus}
                  disabled={!bulkStatus || bulkUpdate.isPending}
                  className="bee-btn bee-btn--primary text-xs"
                >
                  {t("bulk.apply")}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="rounded-full border border-border bg-[var(--color-card)] px-3 py-1 text-xs outline-none"
                >
                  <option value="">{t("bulk.reassignTo")}</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkAssignee}
                  disabled={!bulkAssignee || bulkUpdate.isPending}
                  className="bee-btn bee-btn--primary text-xs"
                >
                  {t("bulk.apply")}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={bulkSequence}
                  onChange={(e) => setBulkSequence(e.target.value)}
                  className="rounded-full border border-border bg-[var(--color-card)] px-3 py-1 text-xs outline-none"
                >
                  <option value="">{t("bulk.sendToSequence")}</option>
                  {(sequencesResult?.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkSequence}
                  disabled={!bulkSequence || bulkEnroll.isPending}
                  className="bee-btn bee-btn--primary inline-flex items-center gap-1 text-xs"
                >
                  <Workflow className="size-3.5" />
                  {bulkEnroll.isPending ? t("bulk.sending") : t("bulk.apply")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="bee-btn-ghost ml-auto text-xs"
              >
                {t("bulk.cancelSelection")}
              </button>
            </div>
          )}

          <div className="bee-surface overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-micro uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                      onChange={toggleAllVisible}
                      className="accent-[var(--color-chart-4)]"
                      aria-label={t("table.selectAllVisible")}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.company")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.title")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.intentScore")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.headers.data")}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      {t("table.noMatch")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead) => {
                    const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
                    const hasIssues = lead.validation_flags.length > 0 || lead.stale_risk;
                    return (
                      <tr key={lead.id} className="border-b border-border last:border-b-0 hover:bg-[var(--color-primary)]/10">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleOne(lead.id)}
                            className="accent-[var(--color-chart-4)]"
                            aria-label={t("table.selectRow", { name: lead.full_name })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{lead.full_name}</p>
                          {lead.email && <p className="bee-micro">{lead.email}</p>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {company ? (
                            <Link
                              href={`/dashboard/companies/${company.id}`}
                              className="hover:text-[var(--color-text)] hover:underline"
                            >
                              {company.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{lead.title ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{leadStatusLabels[lead.status]}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={scoreVariant(lead.score)} className="font-mono">
                            {Math.round(lead.score)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {hasIssues ? (
                            <span
                              title={[
                                ...lead.validation_flags.map((f) => validationFlagLabels[f] ?? f),
                                ...(lead.stale_risk ? [t("table.staleWarning")] : []),
                              ].join(" · ")}
                              className="text-micro text-[var(--color-text)]"
                            >
                              {lead.validation_flags.length > 0
                                ? t("table.issues", { count: lead.validation_flags.length })
                                : t("table.outdated")}
                            </span>
                          ) : (
                            <span className="bee-micro">
                              {lead.last_validated_at
                                ? t("table.validatedAgo", { timeAgo: formatRelativeTime(lead.last_validated_at, locale) })
                                : t("table.notValidated")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => validateLead.mutate(lead.id)}
                            disabled={validateLead.isPending}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 bee-micro transition-colors hover:bg-[var(--color-primary)]/40 hover:text-foreground"
                            title={t("table.validateTitle")}
                          >
                            <RefreshCw className="size-3" />
                            {t("table.validate")}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.some((l) => l.company_id) && (
            <p className="bee-caption">
              {t("tip.prefix")}{" "}
              <Link
                href={demo ? "/probar/companies" : "/dashboard/companies"}
                className="text-[var(--color-text)] hover:underline"
              >
                {t("tip.linkText")}
              </Link>{" "}
              {t("tip.suffix")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
