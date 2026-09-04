"use client";

import { Building2, Check, Plus, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer, type DrawerCreatePreset } from "@/features/crm/opportunity-drawer-context";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useCreateOpportunity } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { getOpportunityTypeLabels, getSignalTypeLabels } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import type { Company, Lead, OpportunityType, Signal, SignalType } from "@/types/domain";

import { Avatar, PaneSection } from "./primitives";
import { STAGE_ACCENT, tint } from "./stage-meta";
import { DrawerTopBar } from "./top-bar";

// Same set LeadCreateIn's own "de dónde salió" field uses (see
// company-detail.tsx's NewContactForm) — one taxonomy for "where did this
// come from" across leads and opportunities, not two that could drift.
const OPPORTUNITY_SOURCES = ["referral", "inbound", "outbound", "event", "cold_call", "other"] as const;
// Stages a person can *start* a deal in. "Listas para actuar" is BEE's own
// gate (a complete battlecard) and is never picked by hand.
const START_STAGES = ["detected", "prioritized", "in_progress"] as const;
const OPPORTUNITY_TYPES: OpportunityType[] = ["new_logo", "expansion", "renewal_risk"];
const MAX_MATCHES = 6;
const FORM_ID = "bee-drawer-create-form";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="bee-micro font-medium">{label}</span>
      {children}
    </label>
  );
}

/**
 * Create mode of the CRM side panel — the "+ Nueva oportunidad" of the
 * CRM, "+ Nuevo lead" of Empresas, "Agregar oportunidad" of a company page
 * and any signal card. Same two panes as view mode: WHO on the left
 * (company, contact, owner), WHAT on the right (signal, headline, context,
 * amount, close date, stage). Everything ties to what already exists:
 *
 *  - Company: pick one of the accounts BEE follows, or type a new one
 *    (with a domain the backend enriches it and runs the first scan).
 *  - Contact: one of that company's leads, or a new one saved under it.
 *  - Deal: owner, starting stage, type, amount, close, priority and the
 *    context that feeds the AI strategy.
 *
 * On save the SAME panel switches to the created opportunity in view mode
 * — the strategy is already there. `useCreateOpportunity` invalidates
 * Opportunities, Companies and Leads, so every other page sees it at once.
 * In the sandbox the same flow runs locally (`demoCreateOpportunity`).
 */
export function CreateOpportunityPanes({ preset }: { preset?: DrawerCreatePreset }) {
  const t = useTranslations("crm.form");
  const tDrawer = useTranslations("crm.drawer");
  const { data: companiesResult } = useCompanies(300);
  const { data: leadsResult } = useLeads(200);
  const { data: signalsResult } = useSignals(200);

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const leads = useMemo(() => leadsResult?.data ?? [], [leadsResult]);

  // ── Presets: a signal, a lead or a company already named by the caller ──
  // Resolved here, before the form mounts, so its initial state can read
  // them directly — no effect that syncs props into state after the fact.
  const presetSignal = useMemo(
    () => (preset?.signalId ? signalsResult?.data.find((s) => s.id === preset.signalId) ?? null : null),
    [signalsResult, preset],
  );
  const presetLead = useMemo(() => {
    const id = preset?.leadId ?? presetSignal?.lead_id ?? null;
    return id ? leads.find((l) => l.id === id) ?? null : null;
  }, [leads, preset, presetSignal]);
  const presetCompany = useMemo(() => {
    const id = preset?.companyId ?? presetLead?.company_id ?? presetSignal?.company_id ?? null;
    return id ? companies.find((c) => c.id === id) ?? null : null;
  }, [companies, preset, presetLead, presetSignal]);

  const waiting =
    (Boolean(preset?.signalId) && !signalsResult) ||
    (Boolean(preset?.leadId ?? presetSignal?.lead_id) && !leadsResult) ||
    (Boolean(preset?.companyId ?? presetLead?.company_id ?? presetSignal?.company_id) && !companiesResult);

  if (waiting) {
    return (
      <>
        <DrawerTopBar
          left={
            <div className="min-w-0 leading-tight">
              <p className="bee-eyebrow">{tDrawer("eyebrow")}</p>
              <p className="truncate text-sm font-semibold">{t("title")}</p>
            </div>
          }
        />
        <div className="grid flex-1 gap-6 p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  return (
    <CreateForm
      companies={companies}
      leads={leads}
      presetSignal={presetSignal}
      presetLead={presetLead}
      presetCompany={presetCompany}
      companyLocked={Boolean(preset?.companyId)}
    />
  );
}

function CreateForm({
  companies,
  leads,
  presetSignal,
  presetLead,
  presetCompany,
  companyLocked,
}: {
  companies: Company[];
  leads: Lead[];
  presetSignal: Signal | null;
  presetLead: Lead | null;
  presetCompany: Company | null;
  companyLocked: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("crm.form");
  const tDrawer = useTranslations("crm.drawer");
  const tStages = useTranslations("crm.board.stages");
  const signalTypeOptions = Object.entries(getSignalTypeLabels(locale)) as [SignalType, string][];
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const { user } = useAuth();
  const { data: users } = useUsers();
  const createOpportunity = useCreateOpportunity();
  const { openOpportunity, closeOpportunity } = useOpportunityDrawer();
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── 1. Company ────────────────────────────────────────────────────────
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyCleared, setCompanyCleared] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [companyFocus, setCompanyFocus] = useState(false);
  const activeCompany = selectedCompany ?? (companyCleared ? null : presetCompany);

  const companyMatches = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies.slice(0, MAX_MATCHES);
    return companies
      .filter((c) => c.name.toLowerCase().includes(q) || (c.domain ?? "").toLowerCase().includes(q))
      .slice(0, MAX_MATCHES);
  }, [companies, companyQuery]);
  const exactCompany = companies.find((c) => c.name.toLowerCase() === companyQuery.trim().toLowerCase());
  const creatingCompany = !activeCompany && companyQuery.trim().length > 0;

  function pickCompany(c: Company) {
    setSelectedCompany(c);
    setCompanyQuery(c.name);
    setCompanyDomain(c.domain ?? "");
    setCompanyFocus(false);
    setSelectedLead(null);
    setLeadCleared(true);
  }

  function clearCompany() {
    setSelectedCompany(null);
    setCompanyCleared(true);
    setCompanyQuery("");
    setCompanyDomain("");
    setSelectedLead(null);
    setLeadCleared(true);
    setNewLead(false);
  }

  // ── 2. Contact ────────────────────────────────────────────────────────
  const companyLeads = useMemo(
    () => (activeCompany ? leads.filter((l) => l.company_id === activeCompany.id) : []),
    [leads, activeCompany],
  );
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadCleared, setLeadCleared] = useState(false);
  const activeLead = selectedLead ?? (leadCleared ? null : presetLead);
  const [newLead, setNewLead] = useState(false);
  const [leadFullName, setLeadFullName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [leadSeniority, setLeadSeniority] = useState("");
  const [leadLinkedin, setLeadLinkedin] = useState("");
  const showNewLeadFields = creatingCompany || newLead || (activeCompany !== null && companyLeads.length === 0);

  // ── 3. Deal ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState(presetSignal?.title ?? "");
  const [assignedTo, setAssignedTo] = useState(user?.id ?? "");
  const [stage, setStage] = useState<(typeof START_STAGES)[number]>("detected");
  const [opportunityType, setOpportunityType] = useState<OpportunityType>("new_logo");
  const [amount, setAmount] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [source, setSource] = useState("");
  const [signalType, setSignalType] = useState<SignalType>(presetSignal?.signal_type ?? "other");
  const [score, setScore] = useState(presetSignal ? Math.round(presetSignal.score) : 50);
  const [description, setDescription] = useState(presetSignal?.description ?? "");
  const [nextMeetingAt, setNextMeetingAt] = useState("");
  const [meetingsHeldCount, setMeetingsHeldCount] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const companyLabel = activeCompany?.name ?? companyQuery.trim();
  const canSubmit = Boolean(companyLabel) && description.trim().length > 0 && !createOpportunity.isPending;
  const hue = STAGE_ACCENT[stage];

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhotoUrl(await resizeImageToDataUrl(file));
    } catch {
      toast.error(t("errorToast"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const created = await createOpportunity.mutateAsync({
        company_id: activeCompany?.id,
        company_name: activeCompany ? activeCompany.name : companyQuery.trim(),
        company_domain: activeCompany ? undefined : companyDomain.trim() || undefined,
        company_industry: activeCompany ? undefined : companyIndustry.trim() || undefined,
        lead_id: activeLead?.id,
        lead_full_name: activeLead ? undefined : leadFullName.trim() || undefined,
        lead_email: activeLead ? undefined : leadEmail.trim() || undefined,
        lead_title: activeLead ? undefined : leadTitle.trim() || undefined,
        lead_seniority: activeLead ? undefined : leadSeniority.trim() || undefined,
        lead_linkedin_url: activeLead ? undefined : leadLinkedin.trim() || undefined,
        title: title.trim() || undefined,
        signal_type: signalType,
        description: description.trim(),
        score,
        amount: amount ? Number(amount) : undefined,
        source: source || undefined,
        next_meeting_at: nextMeetingAt ? new Date(nextMeetingAt).toISOString() : undefined,
        meetings_held_count: meetingsHeldCount ? Number(meetingsHeldCount) : undefined,
        photo_url: photoUrl || undefined,
        assigned_to_user_id: assignedTo || undefined,
        status: stage,
        expected_close_date: expectedClose || undefined,
        opportunity_type: opportunityType,
      });
      toast.success(
        activeCompany
          ? t("successToast", { company: companyLabel })
          : t("successToastNewCompany", { company: companyLabel }),
      );
      // Same panel, now showing what was just created — no navigation.
      openOpportunity(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorToast"));
    }
  }

  return (
    <>
      <DrawerTopBar
        left={
          <div className="min-w-0 leading-tight">
            <p className="bee-eyebrow">{tDrawer("eyebrow")}</p>
            <p className="truncate text-sm font-semibold">{t("title")}</p>
          </div>
        }
        right={
          <>
            <button type="button" onClick={closeOpportunity} className="bee-btn-ghost text-xs">
              {t("cancel")}
            </button>
            <button type="submit" form={FORM_ID} disabled={!canSubmit} className="bee-btn bee-btn--primary text-xs">
              {createOpportunity.isPending ? t("saving") : tDrawer("create")}
            </button>
          </>
        }
      />
      <form
        id={FORM_ID}
        onSubmit={handleSubmit}
        className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)] lg:overflow-hidden"
      >
        {/* ── Left: who ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 border-b border-[var(--color-divider)] px-4 py-5 sm:px-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <PaneSection title={t("steps.company")}>
            {activeCompany ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] px-3 py-2" style={{ background: tint.soft(hue) }}>
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{activeCompany.name}</span>
                  {activeCompany.domain && <span className="bee-micro truncate">{activeCompany.domain}</span>}
                  <span className="bee-micro text-[var(--color-text)]">{t("companyExisting")}</span>
                </span>
                {!companyLocked && (
                  <button type="button" onClick={clearCompany} className="bee-btn-ghost !h-8 text-xs">
                    {t("companyChange")}
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Field label={t("companySearchLabel")}>
                  <input
                    value={companyQuery}
                    onChange={(e) => {
                      setCompanyQuery(e.target.value);
                      setCompanyFocus(true);
                    }}
                    onFocus={() => setCompanyFocus(true)}
                    onBlur={() => window.setTimeout(() => setCompanyFocus(false), 120)}
                    placeholder={t("companySearchPlaceholder")}
                    autoComplete="off"
                    required
                    className="bee-input"
                  />
                </Field>
                {companyFocus && (companyMatches.length > 0 || companyQuery.trim()) && (
                  <ul className="bee-surface absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                    {companyMatches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickCompany(c)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
                        >
                          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{c.name}</span>
                          {c.domain && <span className="bee-micro truncate">{c.domain}</span>}
                        </button>
                      </li>
                    ))}
                    {companyQuery.trim() && !exactCompany && (
                      <li className="border-t border-[var(--color-divider)]">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setCompanyFocus(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
                        >
                          <Plus className="size-3.5 shrink-0" />
                          {t("companyCreate", { name: companyQuery.trim() })}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
            {creatingCompany && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("companyDomain")}>
                  <input value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder="empresa.com" className="bee-input" />
                </Field>
                <Field label={t("companyIndustry")}>
                  <input value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} className="bee-input" />
                </Field>
                <p className="bee-caption sm:col-span-2">{t("companyCreateHint")}</p>
              </div>
            )}
          </PaneSection>

          <PaneSection title={t("steps.contact")}>
            {activeCompany && companyLeads.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {companyLeads.slice(0, 8).map((l) => {
                  const active = activeLead?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setSelectedLead(active ? null : l);
                        setLeadCleared(true);
                        setNewLead(false);
                      }}
                      className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                      style={{ background: active ? tint.chip(hue) : tint.wash("var(--color-text)") }}
                    >
                      {active ? <Check className="size-3.5" /> : <UserRound className="size-3.5 text-muted-foreground" />}
                      <span className="font-medium">{l.full_name}</span>
                      {l.title && <span className="bee-micro">{l.title}</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setNewLead((v) => !v);
                    setSelectedLead(null);
                    setLeadCleared(true);
                  }}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                  style={{ background: newLead ? tint.chip(hue) : tint.wash("var(--color-text)") }}
                >
                  <Plus className="size-3.5" />
                  {t("contactNew")}
                </button>
              </div>
            )}
            {showNewLeadFields && (
              <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", activeCompany && companyLeads.length > 0 && "mt-3")}>
                <Field label={t("contactName")}>
                  <input value={leadFullName} onChange={(e) => setLeadFullName(e.target.value)} className="bee-input" />
                </Field>
                <Field label={t("contactTitle")}>
                  <input value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} className="bee-input" />
                </Field>
                <Field label={t("contactEmail")}>
                  <input value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} type="email" className="bee-input" />
                </Field>
                <Field label={t("contactSeniority")}>
                  <input value={leadSeniority} onChange={(e) => setLeadSeniority(e.target.value)} className="bee-input" />
                </Field>
                <Field label={t("contactLinkedin")} className="sm:col-span-2">
                  <input value={leadLinkedin} onChange={(e) => setLeadLinkedin(e.target.value)} type="url" placeholder="https://linkedin.com/in/…" className="bee-input" />
                </Field>
              </div>
            )}
            {!activeCompany && !creatingCompany && <p className="bee-caption">{t("contactPickCompanyFirst")}</p>}
          </PaneSection>

          <PaneSection title={t("ownerLabel")}>
            <div className="flex items-center gap-3">
              <Avatar name={(users ?? []).find((u) => u.id === assignedTo)?.full_name} hue={hue} size={32} />
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label={t("ownerLabel")} className="bee-input">
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </PaneSection>

          <PaneSection>
            <div className="flex items-center gap-3">
              <Avatar name={leadFullName || activeLead?.full_name} hue={hue} size={36} photoUrl={photoUrl} />
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
              <button type="button" onClick={() => photoInputRef.current?.click()} className="bee-btn-ghost !h-8 text-xs">
                {photoUrl ? t("photoChange") : t("photoUpload")}
              </button>
            </div>
          </PaneSection>
        </div>

        {/* ── Right: what ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 lg:overflow-y-auto">
          <PaneSection title={t("steps.deal")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("signalType")}>
                <select value={signalType} onChange={(e) => setSignalType(e.target.value as SignalType)} className="bee-input">
                  {signalTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("dealTitle")} className="sm:col-span-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={companyLabel ? t("dealTitlePlaceholder", { company: companyLabel }) : ""}
                  className="bee-input"
                />
              </Field>
            </div>
            <Field label={t("descriptionLabel")} className="mt-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                required
                rows={4}
                className="bee-input !h-auto resize-none py-2"
              />
            </Field>
          </PaneSection>

          <PaneSection>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={`${t("estimatedValueLabel")} (${t("estimatedValuePlaceholder")})`}>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="any" className="bee-input" />
              </Field>
              <Field label={t("expectedCloseLabel")}>
                <input value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} type="date" className="bee-input" />
              </Field>
              <Field label={t("stageLabel")}>
                <select value={stage} onChange={(e) => setStage(e.target.value as (typeof START_STAGES)[number])} className="bee-input">
                  {START_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {tStages(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("typeLabel")}>
                <select value={opportunityType} onChange={(e) => setOpportunityType(e.target.value as OpportunityType)} className="bee-input">
                  {OPPORTUNITY_TYPES.map((ot) => (
                    <option key={ot} value={ot}>
                      {opportunityTypeLabels[ot]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("sourceLabel")}>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="bee-input">
                  <option value="">{t("sourcePlaceholder")}</option>
                  {OPPORTUNITY_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`sourceOptions.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`${t("priority")} · ${score}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="h-8"
                  style={{ accentColor: hue }}
                />
              </Field>
              <Field label={t("nextMeetingLabel")}>
                <input value={nextMeetingAt} onChange={(e) => setNextMeetingAt(e.target.value)} type="datetime-local" className="bee-input" />
              </Field>
              <Field label={t("meetingsHeldLabel")}>
                <input value={meetingsHeldCount} onChange={(e) => setMeetingsHeldCount(e.target.value)} type="number" min="0" step="1" className="bee-input" />
              </Field>
            </div>
          </PaneSection>

          <p className="bee-caption">{t("subtitle")}</p>
        </div>
      </form>
    </>
  );
}
