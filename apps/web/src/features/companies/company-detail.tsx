"use client";

import { ArrowUpRight, Radar, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { TONE } from "@/components/charts/palette";
import { RangePills, useTimeRange } from "@/components/charts/range-pills";
import { StackedBars, type StackedPoint } from "@/components/charts/stacked-bars";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { AccountBriefPanel } from "@/components/companies/account-brief-panel";
import { RelationshipMap } from "@/components/companies/relationship-map";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { PageHeader, PageShell } from "@/components/dashboard/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompany, useCompanyActivity, useScanCompany, useUpdateCompany } from "@/hooks/queries/use-companies";
import { useBulkCreateLeads, useLeads } from "@/hooks/queries/use-leads";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import { parseCsv, pickColumn as pick } from "@/lib/csv";
import { useIsDemoMode } from "@/lib/demo/mode";
import { getOpportunityStatusLabels, getOpportunityTypeLabels, getSignalTypeLabels, getValidationFlagLabels, stripOpportunityTitlePrefix } from "@/lib/format";
import { formatCurrencyUSD, formatDate, formatRelativeTime } from "@/lib/i18n/format";
import { computeRelationshipMap } from "@/lib/relationship-map";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

import { InitialsDisc, ListRow, RowChip } from "./table-bits";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const SIGNAL_WINDOW_DAYS = 90;
const CLOSED_STATUSES = ["won", "lost", "dismissed"];

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
  const canManage = currentUser?.role === "owner" || currentUser?.role === "admin" || currentUser?.role === "manager";

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
      <span className="bee-caption whitespace-nowrap">
        {t("label")}: <span className="text-[var(--color-text)]">{owner?.full_name ?? t("unassigned")}</span>
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2">
      <span className="bee-caption whitespace-nowrap">{t("label")}</span>
      <select value={ownerUserId ?? ""} onChange={(e) => handleChange(e.target.value)} disabled={updateCompany.isPending} className="bee-input w-40">
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

/** Who looked at, edited or reassigned this account — hairline rows, only
 *  as many as the box fits. */
function CompanyActivityRows({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail.activity");
  const locale = useLocale() as Locale;
  const { data: activityResult } = useCompanyActivity(companyId);
  const events = activityResult?.data ?? [];
  const [ref, capacity] = useRowCapacity<HTMLDivElement>(44, 0, { min: 4, max: 10 });

  if (events.length === 0) return <p className="bee-caption py-6 text-center">{t("empty")}</p>;

  return (
    <div ref={ref} className="bee-fill flex flex-col overflow-hidden">
      {events.slice(0, capacity).map((event) => (
        <div key={event.id} className="bee-row" style={{ height: 44 }}>
          <InitialsDisc name={event.user_full_name} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm">{t(event.event_type, { name: event.user_full_name })}</span>
          <span className="bee-micro shrink-0">{formatRelativeTime(event.created_at, locale)}</span>
        </div>
      ))}
    </div>
  );
}

/** "Escanear ahora" — the same market scan the cron runs, on demand for
 *  this account. Hidden in the sandbox: nothing to scan there. */
function ScanNowButton({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail.scan");
  const isDemo = useIsDemoMode();
  const scan = useScanCompany();
  if (isDemo) return null;

  async function handleScan() {
    try {
      const result = await scan.mutateAsync(companyId);
      if (!result.enabled) toast.info(t("disabled"));
      else toast.success(t("done", { count: result.signals_created }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("error"));
    }
  }

  return (
    <button type="button" onClick={() => void handleScan()} disabled={scan.isPending} className="bee-btn-ghost">
      <Radar className="size-3.5" />
      {scan.isPending ? t("scanning") : t("scanNow")}
    </button>
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
    <span className="inline-flex items-center gap-2">
      {result && (
        <span className="bee-micro hidden sm:inline">
          {t("resultImported", { count: result.created })}
          {result.skipped > 0 && ` · ${t("resultSkipped", { count: result.skipped })}`}
          {result.errors > 0 && ` · ${t("resultErrors", { count: result.errors })}`}
        </span>
      )}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={bulkCreate.isPending} className="bee-btn-text" title={t("importCsv")}>
        <Upload className="size-3.5" />
        {bulkCreate.isPending ? t("importing") : t("importCsv")}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
    </span>
  );
}

/**
 * Ficha de empresa — the account as one page: four tiles (signals in 90
 * days, open opportunities, meetings, won deals), the signals by week and
 * type, the contacts, the opportunities, the buying committee, the brief,
 * the latest signals and who touched the account. A contact or an
 * opportunity is created through the CRM's drawer, preset to this company.
 */
export function CompanyDetail({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail");
  const locale = useLocale() as Locale;
  const opportunityStatusLabels = getOpportunityStatusLabels(locale);
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const validationFlagLabels = getValidationFlagLabels(locale);
  const signalTypeLabels = getSignalTypeLabels(locale);
  const { data: companyResult, isLoading } = useCompany(companyId);
  const { data: leadsResult } = useLeads(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: signalsResult } = useSignals(200);
  const { data: meetingsData } = useMeetings();
  const { openOpportunity, openNew } = useOpportunityDrawer();
  const [nowMs] = useState(() => Date.now());
  const signalRange = useTimeRange();
  const [contactsRef, contactsCapacity] = useRowCapacity<HTMLDivElement>(52, 0, { min: 4, max: 12 });
  const [signalsRef, signalsCapacity] = useRowCapacity<HTMLDivElement>(52, 0, { min: 4, max: 10 });
  const [oppsRef, oppsCapacity] = useRowCapacity<HTMLDivElement>(52, 0, { min: 4, max: 10 });

  const company = companyResult?.data;
  const leads = useMemo(() => (leadsResult?.data ?? []).filter((l) => l.company_id === companyId), [leadsResult, companyId]);
  const opportunities = useMemo(() => (oppsResult?.data ?? []).filter((o) => o.company_id === companyId), [oppsResult, companyId]);
  const signals = useMemo(
    () => (signalsResult?.data ?? []).filter((s) => s.company_id === companyId).sort((a, b) => b.detected_at.localeCompare(a.detected_at)),
    [signalsResult, companyId],
  );
  // Meetings tied to this account through its opportunities or its contacts —
  // a meeting has no company of its own.
  const meetings = useMemo(() => {
    const oppIds = new Set(opportunities.map((o) => o.id));
    const leadIds = new Set(leads.map((l) => l.id));
    return (meetingsData ?? []).filter((m) => (m.opportunity_id && oppIds.has(m.opportunity_id)) || (m.lead_id && leadIds.has(m.lead_id)));
  }, [meetingsData, opportunities, leads]);

  const openOpps = opportunities.filter((o) => !CLOSED_STATUSES.includes(o.status));
  const wonOpps = opportunities.filter((o) => o.status === "won");
  const pipelineAmount = openOpps.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const signals90 = signals.filter((s) => new Date(s.detected_at).getTime() >= nowMs - SIGNAL_WINDOW_DAYS * DAY_MS);
  const meetingsHeld = meetings.filter((m) => m.completed_at).length;

  // This account's signals stacked by its three most common types — one
  // bar a week over a year, one a month over two or five.
  const weekly = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of signals) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const byWeek = signalRange.range === "1y";
    const fmt = new Intl.DateTimeFormat(localeTags[locale], byWeek ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    const buckets: { from: number; to: number; label: string }[] = [];
    if (byWeek) {
      for (let i = 51; i >= 0; i--) {
        const end = nowMs - i * WEEK_MS;
        buckets.push({ from: end - WEEK_MS, to: end, label: fmt.format(new Date(end)) });
      }
    } else {
      for (let i = signalRange.months - 1; i >= 0; i--) {
        const d = new Date(nowMs);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() - i);
        buckets.push({ from: d.getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), label: fmt.format(d) });
      }
    }
    const points: StackedPoint[] = buckets.map((b, i) => {
      const rows = signals.filter((s) => {
        const ts = new Date(s.detected_at).getTime();
        return ts > b.from && ts <= b.to;
      });
      const parts = top.map((k) => rows.filter((s) => s.signal_type === k).length);
      parts.push(rows.filter((s) => !top.includes(s.signal_type)).length);
      return { label: b.label, parts, current: i === buckets.length - 1 };
    });
    const legend = top.map((k) => signalTypeLabels[k as keyof typeof signalTypeLabels] ?? k);
    if (points.some((p) => p.parts[p.parts.length - 1] > 0)) legend.push(t("signals.other"));
    return { points, legend, trend: points.slice(-8).map((p) => p.parts.reduce((s, v) => s + v, 0)) };
  }, [signals, nowMs, locale, signalTypeLabels, t, signalRange.range, signalRange.months]);

  if (isLoading) {
    return (
      <PageShell header={<Skeleton className="h-16 w-1/2" />}>
        <Skeleton className="h-32" />
        <Skeleton className="mt-6 h-96" />
      </PageShell>
    );
  }

  if (!company) {
    return (
      <PageShell header={<PageHeader eyebrow={t("eyebrow")} title={t("notFound")} />}>
        <p className="bee-caption">{t("notFound")}</p>
      </PageShell>
    );
  }

  const meta = [company.domain, company.industry, company.country, company.size ? `${company.size} ${t("employeesSuffix")}` : null].filter(Boolean).join(" · ");

  return (
    <PageShell
      header={
        <PageHeader
          eyebrow={t("eyebrow")}
          title={company.name}
          caption={meta || company.description || undefined}
          actions={
            <>
              <CompanyOwner companyId={companyId} ownerUserId={company.owner_user_id} />
              {company.website && (
                <a href={company.website} target="_blank" rel="noreferrer" className="bee-btn-ghost">
                  {t("website")}
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
              <ScanNowButton companyId={companyId} />
              <button type="button" onClick={() => openNew({ companyId: company.id })} className="bee-btn bee-btn--primary">
                {t("opportunities.addOpportunity")}
              </button>
            </>
          }
        />
      }
      kpis={
        <StatStrip cols={4}>
          <StatTile label={t("kpi.signals90")} value={signals90.length} trend={weekly.trend} hint={t("kpi.signals90Hint", { count: signals.length })} tone={TONE.market} />
          <StatTile label={t("kpi.openOpportunities")} value={openOpps.length} hint={pipelineAmount > 0 ? t("kpi.opportunitiesHint", { amount: formatCurrencyUSD(pipelineAmount, locale) }) : t("kpi.openOpportunitiesHint", { count: opportunities.length })} tone={TONE.forecast} />
          <StatTile label={t("kpi.meetings")} value={meetings.length} hint={t("kpi.meetingsHint", { count: meetingsHeld })} tone={TONE.urgency} />
          <StatTile label={t("kpi.won")} value={wonOpps.length} progress={opportunities.length > 0 ? wonOpps.length / opportunities.length : 0} tone={TONE.prepared} />
        </StatStrip>
      }
    >
      <div className="bee-overview">
        {/* The account's pulse: 12 weeks of signals by type. */}
        <OverviewCard span={8} title={t("signals.activityTitle")} caption={t("signals.activityCaption")} action={<RangePills value={signalRange.range} onChange={signalRange.setRange} />}>
          {signals.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("signals.empty")}</p>
          ) : (
            <StackedBars points={weekly.points} legend={weekly.legend} tone={TONE.market} minHeight={150} />
          )}
        </OverviewCard>

        {/* The people: as many rows as fit; adding one goes through the drawer. */}
        <OverviewCard
          span={4}
          title={t("contacts.heading", { count: leads.length })}
          caption={t("contacts.caption")}
          action={<CardLink onClick={() => openNew({ companyId: company.id })}>{t("contacts.addContact")}</CardLink>}
        >
          {leads.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("contacts.empty")}</p>
          ) : (
            <div ref={contactsRef} className="bee-fill flex flex-col overflow-hidden">
              {leads.slice(0, contactsCapacity).map((lead) => {
                const issues = [...lead.validation_flags.map((f) => validationFlagLabels[f] ?? f), ...(lead.stale_risk ? [t("contacts.staleWarning")] : [])];
                return (
                  <div key={lead.id} className="bee-row" style={{ height: 52 }} title={issues.length > 0 ? issues.join(" · ") : undefined}>
                    <InitialsDisc name={lead.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lead.full_name}</p>
                      <p className="bee-caption truncate">{[lead.title, lead.seniority].filter(Boolean).join(" · ") || lead.email || t("contacts.noTitle")}</p>
                    </div>
                    {issues.length > 0 && <span className="bee-micro shrink-0">{t("contacts.incompleteShort")}</span>}
                  </div>
                );
              })}
              {leads.length > contactsCapacity && <p className="bee-micro pt-2">{t("contacts.more", { count: leads.length - contactsCapacity })}</p>}
            </div>
          )}
          <div className="mt-auto flex justify-end pt-2">
            <CsvImportButton companyId={companyId} />
          </div>
        </OverviewCard>

        {/* The deals, the committee, the brief — three boxes, one row. */}
        <OverviewCard span={4} title={t("opportunities.heading", { count: opportunities.length })} caption={t("opportunities.caption")}>
          {opportunities.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("opportunities.empty")}</p>
          ) : (
            <div ref={oppsRef} className="bee-fill flex flex-col overflow-hidden">
              {opportunities.slice(0, oppsCapacity).map((opp) => (
                <ListRow key={opp.id} onClick={() => openOpportunity(opp.id)} className="h-[52px]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{stripOpportunityTitlePrefix(opp.title)}</p>
                    <p className="bee-caption truncate">
                      {opp.amount ? formatCurrencyUSD(opp.amount, locale) : "—"}
                      {(opp.opportunity_type ?? "new_logo") !== "new_logo" && ` · ${opportunityTypeLabels[opp.opportunity_type ?? "new_logo"]}`}
                    </p>
                  </div>
                  <RowChip hue={TONE.prepared} level={opp.status === "won" ? 100 : CLOSED_STATUSES.includes(opp.status) ? 45 : 70}>
                    {opportunityStatusLabels[opp.status]}
                  </RowChip>
                </ListRow>
              ))}
              {opportunities.length > oppsCapacity && <p className="bee-micro pt-2">{t("contacts.more", { count: opportunities.length - oppsCapacity })}</p>}
            </div>
          )}
        </OverviewCard>
        <OverviewCard span={4} title={t("relationshipMap.heading")} caption={t("relationshipMap.description")}>
          <RelationshipMap groups={computeRelationshipMap(leads, opportunities)} onOpenOpportunity={openOpportunity} />
        </OverviewCard>
        <AccountBriefPanel companyId={companyId} span={4} />

        {/* The latest signals and who touched the account. */}
        <OverviewCard span={6} title={t("signals.heading", { count: signals.length })} caption={t("signals.listCaption")}>
          {signals.length === 0 ? (
            <p className="bee-caption py-8 text-center">{t("signals.empty")}</p>
          ) : (
            <div ref={signalsRef} className="bee-fill flex flex-col overflow-hidden">
              {signals.slice(0, signalsCapacity).map((signal) => (
                <div key={signal.id} className="bee-row" style={{ height: 52 }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{signal.title}</p>
                    <p className="bee-caption truncate">{t("signals.score", { score: Math.round(signal.score) })}</p>
                  </div>
                  <RowChip hue={TONE.market} level={45} className="hidden shrink-0 sm:inline-flex">
                    {signalTypeLabels[signal.signal_type] ?? signal.signal_type}
                  </RowChip>
                  <span className="bee-micro shrink-0">{formatDate(signal.detected_at, locale)}</span>
                </div>
              ))}
            </div>
          )}
        </OverviewCard>
        <OverviewCard span={6} title={t("activity.heading")} caption={t("activity.caption")}>
          <CompanyActivityRows companyId={companyId} />
        </OverviewCard>
      </div>
    </PageShell>
  );
}
