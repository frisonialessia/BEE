"use client";

import { Flame, RefreshCw, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { LeadDuplicatesPanel } from "@/components/dedup/lead-duplicates-panel";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { MetricCard } from "@/components/metric-card";
import { SavedViewsControl } from "@/components/saved-views/saved-views-control";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadImportPanel } from "@/features/leads/lead-import-panel";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useBulkUpdateLeads, useLeads, useValidateLead } from "@/hooks/queries/use-leads";
import { useUsers } from "@/hooks/queries/use-users";
import { leadStatusLabels, scoreVariant, timeAgo, validationFlagLabels } from "@/lib/format";
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

/** Directorio central de leads — el centro de operaciones para saber a quién
 *  enfocar cada día: intent score, filtros, búsqueda y exportación completa.
 *  Todo se calcula en el cliente a partir de lo que ya está cargado, mismo
 *  patrón que el resto de la BI de BEE — sin endpoint de búsqueda aparte. */
export function LeadsDirectory() {
  const { data: leadsResult, isLoading: leadsLoading } = useLeads(300);
  const { data: companiesResult, isLoading: companiesLoading } = useCompanies(300);
  const { data: users } = useUsers();
  const validateLead = useValidateLead();
  const bulkUpdate = useBulkUpdateLeads();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | "">("");
  const [bulkAssignee, setBulkAssignee] = useState("");
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

  const hotCount = leads.filter((l) => l.score >= 75).length;
  const staleCount = leads.filter((l) => l.stale_risk || l.validation_flags.length > 0).length;
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
      <header className="mb-6">
        <p className="bee-eyebrow">CRM</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="bee-display">Leads</h1>
            <p className="bee-caption mt-1">
              Todo el histórico de prospectos detectados, con puntaje de intención para saber a quién enfocar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={live ? "success" : "warning"}>{live ? "En vivo" : "Datos demo"}</Badge>
            <button type="button" onClick={() => setImportOpen(true)} className="bee-btn-ghost inline-flex items-center gap-1.5">
              <Upload className="size-3.5" />
              Importar prospectos
            </button>
            <ExportCsvButton
              rows={exportRows}
              filename="bee-leads.csv"
              columns={[
                { key: "nombre", header: "Nombre" },
                { key: "empresa", header: "Empresa" },
                { key: "cargo", header: "Cargo" },
                { key: "email", header: "Email" },
                { key: "telefono", header: "Teléfono" },
                { key: "linkedin", header: "LinkedIn" },
                { key: "estado", header: "Estado" },
                { key: "intent_score", header: "Intent score" },
                { key: "frescura_datos", header: "Frescura de datos (%)" },
                { key: "creado", header: "Creado" },
              ]}
            />
          </div>
        </div>
      </header>

      <LeadDuplicatesPanel />
      <LeadImportPanel open={importOpen} onClose={() => setImportOpen(false)} />

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay leads registrados.</p>
          <p className="bee-caption mt-1">Aparecen automáticamente al llegar señales, o agrégalos desde una empresa.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total de leads" value={leads.length} />
            <MetricCard
              label="Intent score promedio"
              value={avgScore}
              tone={avgScore >= 60 ? "default" : "muted"}
            />
            <MetricCard label="Leads calientes (≥75)" value={hotCount} icon={Flame} tone="warm" />
            <MetricCard
              label="Con datos incompletos/vencidos"
              value={staleCount}
              tone={staleCount > 0 ? "warm" : "default"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-full border border-border bg-[var(--color-card)]/60 px-3 py-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email o empresa…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
              className="rounded-full border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs outline-none"
            >
              <option value="all">Todos los estados</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {leadStatusLabels[s]}
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-full border border-border bg-[var(--color-card)] px-3 py-1.5 text-xs outline-none"
            >
              <option value="score_desc">Mayor intent score</option>
              <option value="score_asc">Menor intent score</option>
              <option value="recent">Más recientes</option>
              <option value="name">Nombre (A-Z)</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={(e) => setStaleOnly(e.target.checked)}
                className="accent-[var(--color-chart-4)]"
              />
              Solo con datos incompletos/vencidos
            </label>
            <SavedViewsControl page="leads" currentConfig={currentViewConfig} onApply={applyViewConfig} />
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 px-4 py-2.5">
              <p className="text-xs font-medium">
                {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as LeadStatus | "")}
                  className="rounded-full border border-border bg-[var(--color-card)] px-2.5 py-1 text-xs outline-none"
                >
                  <option value="">Cambiar estado a…</option>
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
                  Aplicar
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="rounded-full border border-border bg-[var(--color-card)] px-2.5 py-1 text-xs outline-none"
                >
                  <option value="">Reasignar a…</option>
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
                  Aplicar
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="bee-btn-ghost ml-auto text-xs"
              >
                Cancelar selección
              </button>
            </div>
          )}

          <div className="bee-surface overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                      onChange={toggleAllVisible}
                      className="accent-[var(--color-chart-4)]"
                      aria-label="Seleccionar todos los visibles"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Nombre</th>
                  <th className="px-4 py-2.5 font-medium">Empresa</th>
                  <th className="px-4 py-2.5 font-medium">Cargo</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">Intent score</th>
                  <th className="px-4 py-2.5 font-medium">Datos</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Ningún lead coincide con estos filtros.
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead) => {
                    const company = lead.company_id ? companyById.get(lead.company_id) : undefined;
                    const hasIssues = lead.validation_flags.length > 0 || lead.stale_risk;
                    return (
                      <tr key={lead.id} className="border-b border-border last:border-b-0 hover:bg-[var(--color-primary)]/10">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleOne(lead.id)}
                            className="accent-[var(--color-chart-4)]"
                            aria-label={`Seleccionar ${lead.full_name}`}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">{lead.full_name}</p>
                          {lead.email && <p className="bee-micro">{lead.email}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {company ? (
                            <Link
                              href={`/dashboard/companies/${company.id}`}
                              className="hover:text-[var(--color-chart-4)] hover:underline"
                            >
                              {company.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{lead.title ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline">{leadStatusLabels[lead.status]}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={scoreVariant(lead.score)} className="font-mono">
                            {Math.round(lead.score)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {hasIssues ? (
                            <span
                              title={[
                                ...lead.validation_flags.map((f) => validationFlagLabels[f] ?? f),
                                ...(lead.stale_risk ? ["Sin validar en más de 90 días"] : []),
                              ].join(" · ")}
                              className="text-[11px] text-[var(--color-chart-1)]"
                            >
                              {lead.validation_flags.length > 0
                                ? `${lead.validation_flags.length} problema${lead.validation_flags.length === 1 ? "" : "s"}`
                                : "Desactualizado"}
                            </span>
                          ) : (
                            <span className="bee-micro">
                              {lead.last_validated_at ? `Validado ${timeAgo(lead.last_validated_at)}` : "Sin validar"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => validateLead.mutate(lead.id)}
                            disabled={validateLead.isPending}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 bee-micro transition-colors hover:bg-[var(--color-primary)]/40 hover:text-foreground"
                            title="Re-validar datos"
                          >
                            <RefreshCw className="size-3" />
                            Validar
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
              Tip: los leads todavía no tienen ficha propia — abre la empresa desde{" "}
              <Link href="/dashboard/companies" className="text-[var(--color-chart-4)] hover:underline">
                Empresas
              </Link>{" "}
              para ver el contacto completo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
