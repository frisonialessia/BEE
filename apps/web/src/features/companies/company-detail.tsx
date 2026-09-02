"use client";

import { AlertTriangle, ArrowUpRight, Building2, Clock, Globe, Mail, Radio, Target, Upload, Users } from "lucide-react";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AccountBriefPanel } from "@/components/companies/account-brief-panel";
import { RelationshipMap } from "@/components/companies/relationship-map";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NewOpportunityForm } from "@/features/crm/new-opportunity-form";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompany, useCompanyActivity, useUpdateCompany } from "@/hooks/queries/use-companies";
import { useBulkCreateLeads, useCreateLead, useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";
import {
  getOpportunityStatusLabels,
  getOpportunityTypeLabels,
  getValidationFlagLabels,
  opportunityTypeVariant,
  stripOpportunityTitlePrefix,
} from "@/lib/format";
import { formatDate, formatRelativeTime } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";
import { parseCsv, pickColumn as pick } from "@/lib/csv";
import { computeRelationshipMap } from "@/lib/relationship-map";

/** Owner display + reassign — visible to everyone, editable only by
 * OWNER/ADMIN/MANAGER (the roles that can already reassign a teammate's
 * team in TeamAdminView). A MEMBER seeing "unassigned" or a teammate's
 * name here with no way to change it isn't a bug — reassignment is a
 * management action, same posture as team/role changes elsewhere. */
function CompanyOwner({ companyId, ownerUserId }: { companyId: string; ownerUserId: string | null }) {
  const t = useTranslations("companiesLeads.companyDetail.owner");
  const { user: currentUser } = useAuth();
  const { data: users } = useUsers();
  const updateCompany = useUpdateCompany();
  const canManage =
    currentUser?.role === "owner" || currentUser?.role === "admin" || currentUser?.role === "manager";

  const owner = (users ?? []).find((u) => u.id === ownerUserId);

  async function handleChange(userId: string) {
    try {
      await updateCompany.mutateAsync({ companyId, body: { owner_user_id: userId || null } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("reassignError"));
    }
  }

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("label")}: {owner?.full_name ?? t("unassigned")}
      </p>
    );
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {t("label")}:
      <select
        value={ownerUserId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={updateCompany.isPending}
        className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-1.5 py-0.5 text-xs outline-none"
      >
        <option value="">{t("unassigned")}</option>
        {(users ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompanyActivityFeed({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail.activity");
  const locale = useLocale() as Locale;
  const { data: activityResult } = useCompanyActivity(companyId);
  const events = activityResult?.data ?? [];

  return (
    <section>
      <h2 className="flex items-center gap-2 bee-card-title">
        <Clock className="size-4 text-muted-foreground" />
        {t("heading")}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="bee-caption flex items-center justify-between gap-3">
              <span>{t(event.event_type, { name: event.user_full_name })}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatRelativeTime(event.created_at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CsvImportButton({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail.contacts.csvImport");
  const bulkCreate = useBulkCreateLeads();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);

    const leads = rows
      .map((row) => {
        const full_name = pick(row, ["full_name", "nombre", "nombre completo", "name"]);
        if (!full_name) return null;
        return {
          full_name,
          company_id: companyId,
          email: pick(row, ["email", "correo", "correo electrónico"]),
          title: pick(row, ["title", "cargo", "puesto"]),
          seniority: pick(row, ["seniority", "nivel"]),
          linkedin_url: pick(row, ["linkedin_url", "linkedin"]),
          phone: pick(row, ["phone", "telefono", "teléfono"]),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    const skipped = rows.length - leads.length;
    if (leads.length === 0) {
      setResult({ created: 0, skipped, errors: 0 });
      return;
    }

    const response = await bulkCreate.mutateAsync(leads);
    setResult({ created: response.created_count, skipped, errors: response.errors.length });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={bulkCreate.isPending}
        className="bee-btn-ghost text-xs"
      >
        <Upload className="size-3.5" />
        {bulkCreate.isPending ? t("importing") : t("importCsv")}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
      {result && (
        <p className="bee-micro">
          {t("resultImported", { count: result.created })}
          {result.skipped > 0 && ` · ${t("resultSkipped", { count: result.skipped })}`}
          {result.errors > 0 && ` · ${t("resultErrors", { count: result.errors })}`}
        </p>
      )}
    </div>
  );
}

function NewContactForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const t = useTranslations("companiesLeads.companyDetail.contacts.newContactForm");
  const createLead = useCreateLead();
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    try {
      await createLead.mutateAsync({
        full_name: fullName.trim(),
        company_id: companyId,
        title: title.trim() || undefined,
        email: email.trim() || undefined,
      });
      setFullName("");
      setTitle("");
      setEmail("");
      onDone();
    } catch (err) {
      // Was previously unhandled — a failed create left the form open with
      // zero feedback, the rejection only visible in the browser console.
      // Same pattern as CompanyOwner's reassign handler just above.
      toast.error(err instanceof ApiError ? err.message : t("createError"));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("namePlaceholder")}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          type="email"
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={!fullName.trim() || createLead.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createLead.isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/** Ficha de empresa — contactos, oportunidades y señales, todo junto. */
export function CompanyDetail({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail");
  const locale = useLocale() as Locale;
  const opportunityStatusLabels = getOpportunityStatusLabels(locale);
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const validationFlagLabels = getValidationFlagLabels(locale);
  const { data: companyResult, isLoading } = useCompany(companyId);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: signalsResult } = useSignals(200);
  const { openOpportunity } = useOpportunityDrawer();

  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);

  const company = companyResult?.data;
  const leads = (leadsResult?.data ?? []).filter((l) => l.company_id === companyId);
  const opportunities = (oppsResult?.data ?? []).filter((o) => o.company_id === companyId);
  const signals = (signalsResult?.data ?? []).filter((s) => s.company_id === companyId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]">
            <Building2 className="size-5 text-[var(--color-chart-4)]" />
          </span>
          <div>
            <h1 className="bee-display">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {company.domain && (
                <span className="flex items-center gap-1">
                  <Globe className="size-3" />
                  {company.domain}
                </span>
              )}
              {company.industry && <span>{company.industry}</span>}
              {company.country && <span>{company.country}</span>}
              {company.size && <span>{company.size} {t("employeesSuffix")}</span>}
            </div>
            <div className="mt-1.5">
              <CompanyOwner companyId={companyId} ownerUserId={company.owner_user_id} />
            </div>
          </div>
        </div>
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
          >
            {t("website")}
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </header>

      {company.description && <p className="text-sm text-muted-foreground">{company.description}</p>}

      <div className="bee-kpi-strip !mt-0">
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">{t("kpi.contacts")}</p>
          <p className="bee-kpi-tile__value">{leads.length}</p>
        </div>
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">{t("kpi.opportunities")}</p>
          <p className="bee-kpi-tile__value">{opportunities.length}</p>
        </div>
        <div className="bee-kpi-tile">
          <p className="bee-kpi-tile__label">{t("kpi.signals")}</p>
          <p className="bee-kpi-tile__value">{signals.length}</p>
        </div>
      </div>

      <AccountBriefPanel companyId={companyId} />

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 bee-card-title">
            <Mail className="size-4 text-muted-foreground" />
            {t("contacts.heading", { count: leads.length })}
          </h2>
          <div className="flex items-center gap-2">
            <CsvImportButton companyId={companyId} />
            <button
              type="button"
              onClick={() => setShowNewContact((v) => !v)}
              className="bee-btn-ghost text-xs"
            >
              {t("contacts.addContact")}
            </button>
          </div>
        </div>
        {showNewContact && (
          <NewContactForm companyId={companyId} onDone={() => setShowNewContact(false)} />
        )}
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("contacts.empty")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {leads.map((lead) => {
              const hasIssues = lead.validation_flags.length > 0 || lead.stale_risk;
              return (
                <div key={lead.id} className="bee-bento bee-bento-pad">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{lead.full_name}</p>
                    {hasIssues && (
                      <span
                        title={[
                          ...lead.validation_flags.map((f) => validationFlagLabels[f] ?? f),
                          ...(lead.stale_risk ? [t("contacts.staleWarning")] : []),
                        ].join(" · ")}
                      >
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0 text-[var(--color-chart-1)]"
                          aria-label={t("contacts.incompleteAria")}
                        />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[lead.title, lead.seniority].filter(Boolean).join(" · ") || t("contacts.noTitle")}
                  </p>
                  {lead.email && <p className="mt-1 text-xs text-muted-foreground">{lead.email}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {leads.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 bee-card-title">
            <Users className="size-4 text-muted-foreground" />
            {t("relationshipMap.heading")}
          </h2>
          <p className="bee-caption mb-3">
            {t("relationshipMap.description")}
          </p>
          <RelationshipMap
            groups={computeRelationshipMap(leads, opportunities)}
            onOpenOpportunity={openOpportunity}
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 bee-card-title">
            <Target className="size-4 text-muted-foreground" />
            {t("opportunities.heading", { count: opportunities.length })}
          </h2>
          <button
            type="button"
            onClick={() => setShowNewOpportunity((v) => !v)}
            className="bee-btn-ghost text-xs"
          >
            {t("opportunities.addOpportunity")}
          </button>
        </div>
        {showNewOpportunity && (
          <NewOpportunityForm
            company={{ name: company.name, domain: company.domain }}
            onDone={() => setShowNewOpportunity(false)}
          />
        )}
        {opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("opportunities.empty")}</p>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => openOpportunity(opp.id)}
                className="bee-bento bee-bento-pad flex w-full items-center justify-between gap-3 text-left transition-colors hover:border-[var(--color-chart-4)]"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {stripOpportunityTitlePrefix(opp.title)}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(opp.opportunity_type ?? "new_logo") !== "new_logo" && (
                    <Badge variant={opportunityTypeVariant(opp.opportunity_type ?? "new_logo")}>
                      {opportunityTypeLabels[opp.opportunity_type ?? "new_logo"]}
                    </Badge>
                  )}
                  <Badge variant="secondary">{opportunityStatusLabels[opp.status]}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 bee-card-title">
          <Radio className="size-4 text-muted-foreground" />
          {t("signals.heading", { count: signals.length })}
        </h2>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("signals.empty")}</p>
        ) : (
          <div className="space-y-2">
            {signals.map((signal) => (
              <div key={signal.id} className="bee-bento bee-bento-pad">
                <p className="text-sm font-medium">{signal.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("signals.score", { score: Math.round(signal.score) })} · {formatDate(signal.detected_at, locale)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <CompanyActivityFeed companyId={companyId} />
    </div>
  );
}
