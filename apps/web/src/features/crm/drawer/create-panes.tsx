"use client";

import { Building2, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { pickedColor, type PickableColor } from "@/components/charts/palette";
import { ColorDots } from "@/components/color-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer, type DrawerCreatePreset } from "@/features/crm/opportunity-drawer-context";
import { useCreateCompany, useCompanies, useScanCompany } from "@/hooks/queries/use-companies";
import { useCreateLead, useLeads } from "@/hooks/queries/use-leads";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useCreateOpportunity, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { localeTags } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { isDemoMode } from "@/lib/demo/mode";
import { getOpportunityTypeLabels } from "@/lib/format";
import { formatMoney, formatRelativeTime } from "@/lib/i18n/format";
import { closedDealSample } from "@/lib/strategy-evidence";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import type { Company, Lead, Opportunity, OpportunityType, Signal, SignalType } from "@/types/domain";

import { AccountPanel } from "./account-panel";
import { countByStep } from "./account-stats";
import { PreviewCard } from "./preview-card";
import { Avatar, Field, Pill, PriorityDots } from "./primitives";
import { STAGE_ACCENT } from "./stage-meta";
import { DrawerTopBar } from "./top-bar";

// Same set LeadCreateIn's own "de dónde salió" field uses (see
// company-detail.tsx's NewContactForm) — one taxonomy for "where did this
// come from" across leads and opportunities, not two that could drift.
const OPPORTUNITY_SOURCES = ["referral", "inbound", "outbound", "event", "cold_call", "other"] as const;
// Stages a person can *start* a deal in. "Listas para actuar" is BEE's own
// gate (a complete battlecard) and is never picked by hand.
const START_STAGES = ["detected", "prioritized", "in_progress"] as const satisfies readonly CrmStage[];
type StartStage = (typeof START_STAGES)[number];
const OPPORTUNITY_TYPES: OpportunityType[] = ["new_logo", "expansion", "renewal_risk"];
const MAX_MATCHES = 6;
const MAX_CHIPS = 8;
const FORM_ID = "bee-drawer-create-form";
const PANES = "lg:grid-cols-[minmax(0,10fr)_minmax(0,13fr)]";
const DRAFT_PREFIX = "bee_opportunity_draft_v1";
const AUTOSAVE_MS = 600;
const MENU_ITEM = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]";

// ── Draft ─────────────────────────────────────────────────────────────────
// Everything typed, as one object: it is the form state AND what goes to
// localStorage, so nothing can be forgotten by one side or the other.

interface Draft {
  companyId: string | null;
  companyQuery: string;
  companyDomain: string;
  companyIndustry: string;
  leadId: string | null;
  leadFullName: string;
  leadTitle: string;
  leadEmail: string;
  leadPhone: string;
  leadLinkedin: string;
  title: string;
  description: string;
  amount: string;
  expectedClose: string;
  opportunityType: OpportunityType;
  source: string;
  stage: StartStage;
  assignedTo: string;
  score: number;
  signalType: SignalType;
  color: PickableColor | null;
}

interface StoredDraft {
  draft: Draft;
  savedAt: string;
}

/** One draft per way of opening the panel: a company page's own, a lead
 *  row's own, a signal card's own, and the blank "+ Nueva oportunidad". */
function draftKey(preset: DrawerCreatePreset | undefined): string {
  const kind = preset?.leadId ? "lead" : preset?.companyId ? "company" : preset?.signalId ? "signal" : "opportunity";
  return `${DRAFT_PREFIX}:${kind}:${preset?.leadId ?? preset?.companyId ?? preset?.signalId ?? ""}`;
}

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.draft !== "object" || !parsed.draft) return null;
    return { draft: parsed.draft, savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString() };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft): string {
  const savedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(key, JSON.stringify({ draft, savedAt } satisfies StoredDraft));
  } catch {
    // Storage full or blocked — the form still holds the text.
  }
  return savedAt;
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Create mode of the CRM side panel — the "+ Nueva oportunidad" of the
 * CRM, "+ Nuevo lead" of Empresas, "Agregar oportunidad" of a company page
 * and any signal card. Left, the form in the calendar dialog's language
 * (caption labels, grey filled inputs, toggle pills, a dot row for the
 * priority); right, the board card the deal will become, redrawn on every
 * keystroke, with the account's charts under it. A preset (company / lead
 * / signal) only decides which fields arrive filled or locked.
 *
 * Nothing typed is lost: the form is a draft in localStorage (one per way
 * of opening the panel), autosaved on every change, restored on reopen,
 * cleared only by a successful create or an explicit "Descartar".
 *
 * On save the SAME panel switches to the created opportunity in view mode
 * — the strategy is already there. The mutations invalidate Opportunities,
 * Companies and Leads, so every other page sees it at once. In the sandbox
 * the same flow runs locally (`demoCreateCompany` / `demoCreateLead` /
 * `demoCreateOpportunity`).
 */
export function CreateOpportunityPanes({ preset }: { preset?: DrawerCreatePreset }) {
  const t = useTranslations("crm.form");
  const tDrawer = useTranslations("crm.drawer");
  const { data: companiesResult } = useCompanies(300);
  const { data: leadsResult } = useLeads(200);
  const { data: signalsResult } = useSignals(200);
  // Bumped by "Descartar borrador": the form remounts empty.
  const [generation, setGeneration] = useState(0);

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const leads = useMemo(() => leadsResult?.data ?? [], [leadsResult]);
  const signals = useMemo(() => signalsResult?.data ?? [], [signalsResult]);

  // ── Presets: a signal, a lead or a company already named by the caller ──
  // Resolved here, before the form mounts, so its initial state can read
  // them directly — no effect that syncs props into state after the fact.
  const presetSignal = useMemo(
    () => (preset?.signalId ? signals.find((s) => s.id === preset.signalId) ?? null : null),
    [signals, preset],
  );
  const presetLead = useMemo(() => {
    const id = preset?.leadId ?? presetSignal?.lead_id ?? null;
    return id ? leads.find((l) => l.id === id) ?? null : null;
  }, [leads, preset, presetSignal]);
  const presetCompany = useMemo(() => {
    const id = preset?.companyId ?? presetLead?.company_id ?? presetSignal?.company_id ?? null;
    return id ? companies.find((c) => c.id === id) ?? null : null;
  }, [companies, preset, presetLead, presetSignal]);

  const waiting = !companiesResult || !leadsResult || (Boolean(preset?.signalId) && !signalsResult);

  if (waiting) {
    return (
      <>
        <DrawerTopBar
          hideClose
          left={
            <div className="min-w-0 leading-tight">
              <p className="bee-eyebrow">{tDrawer("eyebrow")}</p>
              <p className="truncate text-sm font-semibold">{t("title")}</p>
            </div>
          }
        />
        <div className={cn("grid flex-1 gap-6 p-6", PANES)}>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  return (
    <CreateForm
      key={generation}
      draftKey={draftKey(preset)}
      companies={companies}
      leads={leads}
      signals={signals}
      presetSignal={presetSignal}
      presetLead={presetLead}
      presetCompany={presetCompany}
      companyLocked={Boolean(preset?.companyId)}
      leadLocked={Boolean(preset?.leadId)}
      onDiscard={() => setGeneration((g) => g + 1)}
    />
  );
}

function CreateForm({
  draftKey: key,
  companies,
  leads,
  signals,
  presetSignal,
  presetLead,
  presetCompany,
  companyLocked,
  leadLocked,
  onDiscard,
}: {
  draftKey: string;
  companies: Company[];
  leads: Lead[];
  signals: Signal[];
  presetSignal: Signal | null;
  presetLead: Lead | null;
  presetCompany: Company | null;
  companyLocked: boolean;
  leadLocked: boolean;
  onDiscard: () => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("crm.form");
  const tDrawer = useTranslations("crm.drawer");
  const tStages = useTranslations("crm.board.stages");
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { data: oppsResult } = useOpportunities(undefined, 2200);
  const { data: meetingsData } = useMeetings();
  const meetings = useMemo(() => meetingsData ?? [], [meetingsData]);
  const createCompany = useCreateCompany();
  const createLead = useCreateLead();
  const createOpportunity = useCreateOpportunity();
  const scanCompany = useScanCompany();
  const { openOpportunity, closeOpportunity } = useOpportunityDrawer();
  const demo = isDemoMode();

  // ── Draft state: presets first, then whatever was left last time ──────
  const pristine = useMemo<Draft>(
    () => ({
      companyId: presetCompany?.id ?? null,
      companyQuery: "",
      companyDomain: "",
      companyIndustry: "",
      leadId: presetLead?.id ?? null,
      leadFullName: "",
      leadTitle: "",
      leadEmail: "",
      leadPhone: "",
      leadLinkedin: "",
      title: presetSignal?.title ?? "",
      description: presetSignal?.description ?? "",
      amount: "",
      expectedClose: "",
      opportunityType: "new_logo",
      source: "",
      stage: "detected",
      assignedTo: user?.id ?? "",
      score: presetSignal ? Math.round(presetSignal.score) : 50,
      signalType: presetSignal?.signal_type ?? "other",
      color: null,
    }),
    [presetCompany, presetLead, presetSignal, user],
  );
  const [stored] = useState(() => (typeof window === "undefined" ? null : readDraft(key)));
  const [draft, setDraft] = useState<Draft>(() => (stored ? { ...pristine, ...stored.draft } : pristine));
  const [savedAt, setSavedAt] = useState<string | null>(stored?.savedAt ?? null);
  // Ticks so "hace 2 min" keeps moving; Date.now() in render is impure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(pristine);
  // Debounced autosave: every change re-arms the timer, so the write always
  // carries the latest draft and a fast typist costs one write, not one
  // per keystroke.
  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(() => {
      setSavedAt(writeDraft(key, draft));
      setNow(Date.now());
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [draft, dirty, key]);

  function flushDraft() {
    if (dirty) setSavedAt(writeDraft(key, draft));
  }

  function discardDraft() {
    clearDraft(key);
    onDiscard();
  }

  // ── Company ───────────────────────────────────────────────────────────
  const [companyFocus, setCompanyFocus] = useState(false);
  const activeCompany = draft.companyId ? companies.find((c) => c.id === draft.companyId) ?? null : null;
  const companyMatches = useMemo(() => {
    const q = draft.companyQuery.trim().toLowerCase();
    if (!q) return companies.slice(0, MAX_MATCHES);
    return companies
      .filter((c) => c.name.toLowerCase().includes(q) || (c.domain ?? "").toLowerCase().includes(q))
      .slice(0, MAX_MATCHES);
  }, [companies, draft.companyQuery]);
  const exactCompany = companies.find((c) => c.name.toLowerCase() === draft.companyQuery.trim().toLowerCase()) ?? null;
  const creatingCompany = !activeCompany && draft.companyQuery.trim().length > 0;

  function pickCompany(c: Company) {
    update({ companyId: c.id, companyQuery: c.name, companyDomain: c.domain ?? "", leadId: null });
    setCompanyFocus(false);
  }

  function clearCompany() {
    update({ companyId: null, companyQuery: "", companyDomain: "", companyIndustry: "", leadId: null });
  }

  // ── Contact ───────────────────────────────────────────────────────────
  const companyLeads = useMemo(
    () => (activeCompany ? leads.filter((l) => l.company_id === activeCompany.id) : []),
    [leads, activeCompany],
  );
  const activeLead = draft.leadId ? leads.find((l) => l.id === draft.leadId) ?? null : null;
  const contactPills = useMemo(() => {
    const list = companyLeads.slice(0, MAX_CHIPS);
    if (activeLead && !list.some((l) => l.id === activeLead.id)) list.unshift(activeLead);
    return list;
  }, [companyLeads, activeLead]);

  // ── Deal ──────────────────────────────────────────────────────────────
  const hue = STAGE_ACCENT[draft.stage];
  const owner = (users ?? []).find((u) => u.id === draft.assignedTo) ?? null;
  const companyLabel = activeCompany?.name ?? draft.companyQuery.trim();
  const contactLabel = activeLead?.full_name ?? draft.leadFullName.trim();
  const draftAmount = draft.amount ? Number(draft.amount) : 0;
  const busy = createCompany.isPending || createLead.isPending || createOpportunity.isPending;
  const canSubmit = Boolean(companyLabel) && draft.description.trim().length > 0 && !busy;
  const stageWord = tStages(draft.stage);
  const today = useMemo(() => new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short" }).format(new Date(now)), [locale, now]);

  // ── Account: what the company already has in the pipeline, this draft
  //    counted in its chosen stage and the current month.
  const allOpps = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const accountOpps = useMemo(
    () => (activeCompany ? allOpps.filter((o) => o.company_id === activeCompany.id) : []),
    [allOpps, activeCompany],
  );
  const byStep = useMemo(() => countByStep(accountOpps), [accountOpps]);

  // ── Expected value = amount × historical close rate. The rate is a count
  //    over real closed deals: this account's, else deals born from the
  //    same signal type, else the whole org. Never a made-up number.
  const closeRate = (() => {
    const ofType = new Set(signals.filter((s) => s.signal_type === draft.signalType).map((s) => s.id));
    const cohorts: Opportunity[][] = [accountOpps, allOpps.filter((o) => o.signal_id != null && ofType.has(o.signal_id)), allOpps];
    for (const cohort of cohorts) {
      const sample = closedDealSample(cohort);
      if (sample.closed > 0) return { rate: sample.won / sample.closed, n: sample.closed };
    }
    return null;
  })();
  const expectedValue = closeRate && draftAmount > 0 ? draftAmount * closeRate.rate : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      // 1. The account — an existing one, or created from the name typed
      //    (plus website and sector when given).
      let company = activeCompany ?? exactCompany;
      if (!company) {
        const domain = draft.companyDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        company = await createCompany.mutateAsync({
          name: draft.companyQuery.trim(),
          domain: domain || undefined,
          industry: draft.companyIndustry.trim() || undefined,
          website: domain ? `https://${domain}` : undefined,
        });
        // Same market scan as "Escanear ahora" — live only, and never a
        // blocker: the deal is created whether or not the scan answers.
        if (!demo) scanCompany.mutate(company.id, { onError: () => undefined });
      }

      // 2. The contact — an existing lead, or a new one saved under the
      //    account (the lead endpoint is the one that carries a phone).
      let lead = activeLead;
      if (!lead && draft.leadFullName.trim()) {
        lead = await createLead.mutateAsync({
          full_name: draft.leadFullName.trim(),
          company_id: company.id,
          email: draft.leadEmail.trim() || undefined,
          title: draft.leadTitle.trim() || undefined,
          linkedin_url: draft.leadLinkedin.trim() || undefined,
          phone: draft.leadPhone.trim() || undefined,
          source: draft.source || undefined,
        });
      }

      // 3. The deal itself — always pointing at ids. Name/title/email ride
      //    along for the sandbox battlecard.
      const created = await createOpportunity.mutateAsync({
        company_id: company.id,
        company_name: company.name,
        lead_id: lead?.id,
        lead_full_name: lead?.full_name,
        lead_email: lead?.email ?? undefined,
        lead_title: lead?.title ?? undefined,
        title: draft.title.trim() || undefined,
        signal_type: draft.signalType,
        description: draft.description.trim(),
        score: draft.score,
        amount: draftAmount > 0 ? draftAmount : undefined,
        source: draft.source || undefined,
        assigned_to_user_id: draft.assignedTo || undefined,
        status: draft.stage,
        expected_close_date: draft.expectedClose || undefined,
        opportunity_type: draft.opportunityType,
        color: draft.color ?? undefined,
      });
      clearDraft(key);
      toast.success(activeCompany ? t("successToast", { company: company.name }) : t("successToastNewCompany", { company: company.name }));
      // Same panel, now showing what was just created — no navigation.
      openOpportunity(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorToast"));
    }
  }

  function handleSaveDraft() {
    flushDraft();
    toast.success(t("draft.savedToast"));
    closeOpportunity();
  }

  function handleCancel() {
    flushDraft();
    closeOpportunity();
  }

  return (
    <>
      <DrawerTopBar
        hideClose
        left={
          <div className="min-w-0 leading-tight">
            <p className="bee-eyebrow">{tDrawer("eyebrow")}</p>
            <p className="truncate text-sm">
              <span className="font-semibold">{t("title")}</span>
              <span className="text-muted-foreground"> · {t("stageLabel")}: {stageWord}</span>
            </p>
          </div>
        }
        right={
          <>
            {savedAt && <span className="bee-caption hidden sm:inline">{t("draft.saved", { time: formatRelativeTime(savedAt, locale, new Date(now)) })}</span>}
            <button type="button" onClick={handleCancel} className="bee-btn-ghost !text-sm">
              {t("cancel")}
            </button>
          </>
        }
      />
      <form id={FORM_ID} onSubmit={handleSubmit} className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", PANES)}>
        {/* ── Left: the form, in the calendar dialog's language ──────────── */}
        <div className="flex flex-col gap-5 bg-[var(--color-card)] px-5 py-6 sm:px-7 lg:overflow-y-auto">
          <div className="leading-tight">
            <h2 className="bee-display">{t("title")}</h2>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>

          {/* Empresa */}
          <div className="flex flex-col gap-2">
            {activeCompany ? (
              <Field label={t("company")} required>
                <div className="bee-input flex items-center gap-2">
                  <Building2 className="size-3.5 shrink-0 stroke-[1.5]" />
                  <span className="min-w-0 truncate font-medium">{activeCompany.name}</span>
                  {activeCompany.domain && <span className="min-w-0 truncate text-muted-foreground">{activeCompany.domain}</span>}
                  {!companyLocked && (
                    <button type="button" onClick={clearCompany} aria-label={t("change")} title={t("change")} className="ml-auto grid size-5 shrink-0 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </Field>
            ) : (
              <div className="relative">
                <Field label={t("company")} required>
                  <input
                    value={draft.companyQuery}
                    onChange={(e) => {
                      update({ companyQuery: e.target.value });
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
                {companyFocus && (companyMatches.length > 0 || draft.companyQuery.trim()) && (
                  <ul className="bee-surface absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                    {companyMatches.map((c) => (
                      <li key={c.id}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickCompany(c)} className={MENU_ITEM}>
                          <Building2 className="size-3.5 shrink-0 stroke-[1.5] text-muted-foreground" />
                          <span className="truncate">{c.name}</span>
                          {c.domain && <span className="truncate text-muted-foreground">{c.domain}</span>}
                        </button>
                      </li>
                    ))}
                    {draft.companyQuery.trim() && !exactCompany && (
                      <li className="border-t border-[var(--color-divider)]">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setCompanyFocus(false)} className={cn(MENU_ITEM, "font-medium")}>
                          <Plus className="size-3.5 shrink-0" />
                          {t("companyCreate", { name: draft.companyQuery.trim() })}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {creatingCompany && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("companyWebsite")}>
                  <input value={draft.companyDomain} onChange={(e) => update({ companyDomain: e.target.value })} placeholder={t("companyDomainPlaceholder")} className="bee-input" />
                </Field>
                <Field label={t("companyIndustry")}>
                  <input value={draft.companyIndustry} onChange={(e) => update({ companyIndustry: e.target.value })} className="bee-input" />
                </Field>
              </div>
            )}

            {activeCompany && contactPills.length > 0 && (
              <div role="group" aria-label={t("contact")} className="flex flex-wrap gap-2">
                {contactPills.map((l) => (
                  <Pill key={l.id} pressed={l.id === activeLead?.id} disabled={leadLocked && l.id !== activeLead?.id} title={l.title ?? undefined} onClick={() => update({ leadId: l.id })}>
                    <Avatar name={l.full_name} size={18} />
                    <span className="max-w-36 truncate">{l.full_name}</span>
                  </Pill>
                ))}
                {!leadLocked && (
                  <Pill pressed={activeLead === null} onClick={() => update({ leadId: null })}>
                    <Plus className="size-3.5" />
                    {t("contactNew")}
                  </Pill>
                )}
              </div>
            )}
          </div>

          {/* Contacto */}
          <div className="flex flex-col gap-2 border-t border-[var(--color-divider)] pt-5">
            {activeLead ? (
              <Field label={t("contact")}>
                <div className="flex items-center gap-3 py-1">
                  <Avatar name={activeLead.full_name} size={32} photoUrl={activeLead.photo_url} />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold">{activeLead.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{[activeLead.title, activeLead.email].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                </div>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("contactName")}>
                  <input value={draft.leadFullName} onChange={(e) => update({ leadFullName: e.target.value })} placeholder={t("contactNamePlaceholder")} autoComplete="off" className="bee-input" />
                </Field>
                <Field label={t("contactTitle")}>
                  <input value={draft.leadTitle} onChange={(e) => update({ leadTitle: e.target.value })} className="bee-input" />
                </Field>
                <Field label={t("contactEmail")}>
                  <input value={draft.leadEmail} onChange={(e) => update({ leadEmail: e.target.value })} type="email" placeholder={t("contactEmailPlaceholder")} className="bee-input" />
                </Field>
                <Field label={t("contactPhone")}>
                  <input value={draft.leadPhone} onChange={(e) => update({ leadPhone: e.target.value })} type="tel" placeholder="+52 55 0000 0000" className="bee-input" />
                </Field>
                <Field label={t("contactLinkedin")} className="col-span-2">
                  <input value={draft.leadLinkedin} onChange={(e) => update({ leadLinkedin: e.target.value })} type="url" placeholder="https://linkedin.com/in/…" className="bee-input" />
                </Field>
              </div>
            )}
          </div>

          {/* Oportunidad */}
          <div className="flex flex-col gap-2 border-t border-[var(--color-divider)] pt-5">
            <Field label={t("dealTitle")} required>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder={companyLabel ? t("dealTitlePlaceholder", { company: companyLabel }) : undefined} className="bee-input" />
            </Field>
            <Field label={t("descriptionLabel")} required>
              <textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder={t("descriptionPlaceholder")} required rows={3} className="bee-input" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("amountLabel")}>
                <input value={draft.amount} onChange={(e) => update({ amount: e.target.value })} type="number" min="0" step="any" placeholder="0" className="bee-input tabular-nums" />
              </Field>
              <Field label={t("expectedCloseLabel")}>
                <input value={draft.expectedClose} onChange={(e) => update({ expectedClose: e.target.value })} type="date" className="bee-input" />
              </Field>
            </div>
          </div>

          {/* Etapa — pills in the board's own stage hues */}
          <div className="flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-5">
            <p className="bee-caption">{t("stageLabel")}</p>
            <div role="group" aria-label={t("stageLabel")} className="flex flex-wrap gap-2">
              {CRM_STAGES.map((s) => {
                const startable = (START_STAGES as readonly CrmStage[]).includes(s.id);
                return (
                  <Pill key={s.id} pressed={draft.stage === s.id} fill={STAGE_ACCENT[s.id]} disabled={!startable} title={startable ? undefined : t("stageHint")} onClick={() => startable && update({ stage: s.id as StartStage })}>
                    {tStages(s.id)}
                  </Pill>
                );
              })}
            </div>
            <p className="bee-micro">{t("stageHint")}</p>
          </div>

          {/* Responsable — team pills, like "Invitar a tu equipo" */}
          <div className="flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-5">
            <p className="bee-caption">{t("ownerLabel")}</p>
            <div role="group" aria-label={t("ownerLabel")} className="flex flex-wrap gap-2">
              {(users ?? []).map((u) => (
                <Pill key={u.id} pressed={draft.assignedTo === u.id} onClick={() => update({ assignedTo: draft.assignedTo === u.id ? "" : u.id })}>
                  {u.full_name}
                </Pill>
              ))}
            </div>
          </div>

          {/* Prioridad · Color — the dialog's dot rows */}
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--color-divider)] pt-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="bee-caption">{t("priority")}</p>
              <PriorityDots score={draft.score} onChange={(score) => update({ score })} />
              <p className="bee-micro">{t("priorityHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="bee-caption">{t("colorLabel")}</p>
              <ColorDots value={draft.color} onChange={(color) => update({ color })} />
              <p className="bee-micro">{t("colorHint")}</p>
            </div>
          </div>

          {/* Tipo · Origen — pills, never a select */}
          <div className="flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-5">
            <p className="bee-caption">{t("typeLabel")} · {t("sourceLabel")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {OPPORTUNITY_TYPES.map((ot) => (
                <Pill key={ot} pressed={draft.opportunityType === ot} onClick={() => update({ opportunityType: ot })}>
                  {opportunityTypeLabels[ot]}
                </Pill>
              ))}
              <span className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)]" aria-hidden="true" />
              {OPPORTUNITY_SOURCES.map((src) => (
                <Pill key={src} pressed={draft.source === src} onClick={() => update({ source: draft.source === src ? "" : src })}>
                  {t(`sourceOptions.${src}`)}
                </Pill>
              ))}
            </div>
            <p className="bee-micro">{t("typeHint")}</p>
          </div>
        </div>

        {/* ── Right: the card this becomes, live, and the account under it ── */}
        <div className="flex flex-col gap-4 bg-[var(--color-background)] px-5 pt-6 sm:px-7 lg:overflow-y-auto">
          <div className="flex flex-wrap items-start gap-6">
            <PreviewCard
              title={draft.title.trim()}
              placeholder={companyLabel ? t("dealTitlePlaceholder", { company: companyLabel }) : t("preview.untitled")}
              stageLabel={stageWord}
              columnCount={byStep[draft.stage] + 1}
              accent={hue}
              score={draft.score}
              status={draft.stage}
              ownerName={owner?.full_name ?? null}
              date={today}
              hot={draft.score >= 75}
              color={pickedColor(draft.color)}
            />
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 self-center text-sm">
              <dt className="bee-caption">{t("company")}</dt>
              <dd className={cn("truncate", !companyLabel && "text-muted-foreground")}>{companyLabel || "—"}</dd>
              <dt className="bee-caption">{t("contact")}</dt>
              <dd className={cn("truncate", !contactLabel && "text-muted-foreground")}>{contactLabel || "—"}</dd>
              <dt className="bee-caption">{t("amountLabel")}</dt>
              <dd className={cn("truncate tabular-nums", draftAmount <= 0 && "text-muted-foreground")}>{draftAmount > 0 ? formatMoney(draftAmount, "USD", locale) : "—"}</dd>
              <dt className="bee-caption">{t("expectedValue")}</dt>
              <dd className="truncate tabular-nums">
                {closeRate ? (
                  <>
                    {expectedValue != null && <span className="font-semibold">{formatMoney(expectedValue, "USD", locale)} · </span>}
                    <span className="text-muted-foreground">{t("expectedValueRate", { pct: Math.round(closeRate.rate * 100), count: closeRate.n })}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("expectedValueNoSample")}</span>
                )}
              </dd>
            </dl>
          </div>

          <AccountPanel
            company={activeCompany}
            accountOpps={accountOpps}
            allOpps={allOpps}
            signals={signals}
            meetings={meetings}
            draftStep={draft.stage}
            emptyHint={t("charts.pickCompany")}
          />

          {/* Footer: the draft's state · the one primary action */}
          <div className="sticky bottom-0 -mx-5 mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-divider)] bg-[var(--color-background)] px-5 py-3 sm:-mx-7 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              {savedAt && (
                <>
                  <span className="truncate text-sm">{t("draft.saved", { time: formatRelativeTime(savedAt, locale, new Date(now)) })}</span>
                  <button type="button" onClick={discardDraft} className="bee-btn-text !text-sm">
                    {t("draft.discard")}
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSaveDraft} disabled={!dirty} className="bee-btn-ghost !text-sm">
                {t("draft.save")}
              </button>
              <button type="submit" form={FORM_ID} disabled={!canSubmit} className="bee-btn bee-btn--primary !text-sm">
                {busy ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
