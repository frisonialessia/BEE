"use client";

import {
  Building2,
  CalendarClock,
  ExternalLink,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Radio,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, SALES, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer, type DrawerCreatePreset } from "@/features/crm/opportunity-drawer-context";
import { useCreateCompany, useCompanies, useScanCompany } from "@/hooks/queries/use-companies";
import { useCreateLead, useLeads } from "@/hooks/queries/use-leads";
import { useCreateOpportunity, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { EMPLOYEE_RANGES } from "@/lib/api/organizations";
import { isDemoMode } from "@/lib/demo/mode";
import { getOpportunityTypeLabels, getSignalTypeLabels } from "@/lib/format";
import { formatMoney, formatRelativeTime } from "@/lib/i18n/format";
import { closedDealSample } from "@/lib/strategy-evidence";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import type { Company, Lead, Opportunity, OpportunityType, Signal, SignalType } from "@/types/domain";

import { countByStep, monthlyAmounts, segmentFill } from "./account-stats";
import { Avatar, IconDisc, PaneSection } from "./primitives";
import { STAGE_ACCENT, STEP_ORDER } from "./stage-meta";
import { StageStepper } from "./stage-stepper";
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
// Priority as three steps on BEE's 0–100 score: a preset signal keeps its
// exact score, a click snaps to the step's center.
const PRIORITY_STEPS = [
  { key: "low", score: 25, max: 40 },
  { key: "mid", score: 50, max: 70 },
  { key: "high", score: 80, max: 101 },
] as const;
const MAX_MATCHES = 6;
const MAX_CHIPS = 6;
const FORM_ID = "bee-drawer-create-form";
const PANES = "lg:grid-cols-[minmax(0,9fr)_minmax(0,16fr)]";
const DRAFT_PREFIX = "bee_opportunity_draft_v1";
const AUTOSAVE_MS = 600;

/** An editable slot: the field sits exactly where view mode prints the
 *  value — no box around it, a hairline under it, the label is the
 *  placeholder. Same type size as the value it replaces. */
const INLINE =
  "min-w-0 w-full border-0 border-b border-[var(--color-divider)] bg-transparent py-0.5 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-chart-4)]";
const MENU_ITEM = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]";

// ── Draft ─────────────────────────────────────────────────────────────────
// Everything typed, as one object: it is the form state AND what goes to
// localStorage, so nothing can be forgotten by one side or the other.

interface Draft {
  companyId: string | null;
  companyQuery: string;
  companyDomain: string;
  companyLinkedin: string;
  companyIndustry: string;
  companySize: string;
  companyCountry: string;
  companySites: string;
  leadId: string | null;
  leadFullName: string;
  leadTitle: string;
  leadSeniority: string;
  leadEmail: string;
  leadPhone: string;
  leadLinkedin: string;
  title: string;
  assignedTo: string;
  stage: StartStage;
  opportunityType: OpportunityType;
  amount: string;
  expectedClose: string;
  source: string;
  signalType: SignalType;
  score: number;
  description: string;
  nextMeetingAt: string;
  meetingsHeldCount: string;
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

// ── Small pieces ──────────────────────────────────────────────────────────

/** Icon disc + label + slot — InfoRow without the overflow clip, so an
 *  autocomplete menu can hang below the field. */
function EditRow({ icon, hue, label, children }: { icon: LucideIcon; hue: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconDisc icon={icon} hue={hue} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="bee-caption">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Initials once there is a name; a person icon before — never a dash. */
function PersonDisc({ name, hue, size, photoUrl }: { name: string | null | undefined; hue: string; size: number; photoUrl?: string | null }) {
  if (name?.trim() || photoUrl) return <Avatar name={name} hue={hue} size={size} photoUrl={photoUrl} />;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: mix(hue, 20) }}>
      <UserRound className="size-4 stroke-[1.5] text-[var(--color-text)]" />
    </span>
  );
}

/** Label over value, for a fact the account already has. */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0 leading-tight">
      <p className="bee-caption">{label}</p>
      <p className="truncate text-sm">{value}</p>
    </div>
  );
}

/**
 * Create mode of the CRM side panel — the "+ Nueva oportunidad" of the
 * CRM, "+ Nuevo lead" of Empresas, "Agregar oportunidad" of a company page
 * and any signal card. It LOOKS like view mode: the same two panes with
 * every field in the slot where the opportunity will later show it —
 * contact and account on the left over the amount box and the owner, the
 * pipeline stepper (click = starting stage), the "why" strip and the
 * account's charts on the right. A preset (company / lead / signal) only
 * decides which slots arrive filled or locked; the layout never changes.
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

  const waiting =
    !companiesResult ||
    !leadsResult ||
    (Boolean(preset?.signalId) && !signalsResult);

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
  const signalTypeOptions = Object.entries(getSignalTypeLabels(locale)) as [SignalType, string][];
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { data: oppsResult } = useOpportunities(undefined, 300);
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
      companyLinkedin: "",
      companyIndustry: "",
      companySize: "",
      companyCountry: "",
      companySites: "",
      leadId: presetLead?.id ?? null,
      leadFullName: "",
      leadTitle: "",
      leadSeniority: "",
      leadEmail: "",
      leadPhone: "",
      leadLinkedin: "",
      title: presetSignal?.title ?? "",
      assignedTo: user?.id ?? "",
      stage: "detected",
      opportunityType: "new_logo",
      amount: "",
      expectedClose: "",
      source: "",
      signalType: presetSignal?.signal_type ?? "other",
      score: presetSignal ? Math.round(presetSignal.score) : 50,
      description: presetSignal?.description ?? "",
      nextMeetingAt: "",
      meetingsHeldCount: "",
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
  const companySites = draft.companySites.split(",").map((s) => s.trim()).filter(Boolean);

  function pickCompany(c: Company) {
    update({ companyId: c.id, companyQuery: c.name, companyDomain: c.domain ?? "", leadId: null });
    setCompanyFocus(false);
  }

  function clearCompany() {
    update({ companyId: null, companyQuery: "", companyDomain: "", leadId: null });
  }

  // ── Contact ───────────────────────────────────────────────────────────
  const [leadFocus, setLeadFocus] = useState(false);
  const companyLeads = useMemo(
    () => (activeCompany ? leads.filter((l) => l.company_id === activeCompany.id) : []),
    [leads, activeCompany],
  );
  const activeLead = draft.leadId ? leads.find((l) => l.id === draft.leadId) ?? null : null;
  const leadMatches = useMemo(() => {
    const q = draft.leadFullName.trim().toLowerCase();
    return (q ? companyLeads.filter((l) => l.full_name.toLowerCase().includes(q)) : companyLeads).slice(0, MAX_MATCHES);
  }, [companyLeads, draft.leadFullName]);
  const otherLeads = companyLeads.filter((l) => l.id !== activeLead?.id).slice(0, MAX_CHIPS);

  function pickLead(l: Lead) {
    update({ leadId: l.id });
    setLeadFocus(false);
  }

  // ── Deal ──────────────────────────────────────────────────────────────
  const hue = STAGE_ACCENT[draft.stage];
  const owner = (users ?? []).find((u) => u.id === draft.assignedTo) ?? null;
  const contactName = activeLead?.full_name ?? draft.leadFullName;
  const companyLabel = activeCompany?.name ?? draft.companyQuery.trim();
  const draftAmount = draft.amount ? Number(draft.amount) : 0;
  const busy = createCompany.isPending || createLead.isPending || createOpportunity.isPending;
  const canSubmit = Boolean(companyLabel) && draft.description.trim().length > 0 && !busy;
  const priorityStep = PRIORITY_STEPS.find((s) => draft.score < s.max) ?? PRIORITY_STEPS[PRIORITY_STEPS.length - 1];

  // ── Account: what the company already has in the pipeline, this draft
  //    counted in its chosen stage and the current month.
  const allOpps = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const accountOpps = useMemo(
    () => (activeCompany ? allOpps.filter((o) => o.company_id === activeCompany.id) : []),
    [allOpps, activeCompany],
  );
  const byStep = useMemo(() => countByStep(accountOpps), [accountOpps]);
  const funnelRows = STEP_ORDER.map((s) => ({
    label: tStages(s),
    value: byStep[s] + (s === draft.stage ? 1 : 0),
    color: segmentFill(s, accountOpps),
  }));
  const monthly = useMemo(() => {
    const points = monthlyAmounts(accountOpps, locale);
    const last = points.length - 1;
    if (draftAmount > 0) points[last] = { ...points[last], value: points[last].value + draftAmount };
    return points;
  }, [accountOpps, locale, draftAmount]);
  const hasAmounts = monthly.some((p) => p.value > 0);

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

  // ── BEE summary slot: only what exists — never invented.
  const summary = activeCompany
    ? activeCompany.description || t("summary.none")
    : creatingCompany && draft.companyDomain.trim() && !demo
      ? t("summary.onCreate")
      : creatingCompany && !demo
        ? t("summary.addWebsite")
        : t("summary.none");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      // 1. The account — an existing one, or created with every fact typed
      //    (the opportunity endpoint only carries name/domain/industry).
      let company = activeCompany ?? exactCompany;
      if (!company) {
        const notes = [
          draft.companyLinkedin.trim() && `${t("companyLinkedin")}: ${draft.companyLinkedin.trim()}`,
          companySites.length > 0 && `${t("companySites")}: ${companySites.join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n");
        const domain = draft.companyDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        company = await createCompany.mutateAsync({
          name: draft.companyQuery.trim(),
          domain: domain || undefined,
          industry: draft.companyIndustry.trim() || undefined,
          size: draft.companySize || undefined,
          country: draft.companyCountry.trim() || undefined,
          website: domain ? `https://${domain}` : undefined,
          description: notes || undefined,
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
          seniority: draft.leadSeniority.trim() || undefined,
          linkedin_url: draft.leadLinkedin.trim() || undefined,
          phone: draft.leadPhone.trim() || undefined,
          source: draft.source || undefined,
        });
      }

      // 3. The deal itself — same payload as before, now always pointing
      //    at ids. Name/title/email ride along for the sandbox battlecard.
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
        next_meeting_at: draft.nextMeetingAt ? new Date(draft.nextMeetingAt).toISOString() : undefined,
        meetings_held_count: draft.meetingsHeldCount ? Number(draft.meetingsHeldCount) : undefined,
        assigned_to_user_id: draft.assignedTo || undefined,
        status: draft.stage,
        expected_close_date: draft.expectedClose || undefined,
        opportunity_type: draft.opportunityType,
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

  const companyLine = activeCompany ? [activeCompany.domain, activeCompany.industry, activeCompany.country].filter(Boolean).join(" · ") : "";
  const stageWord = tStages(draft.stage);

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
        right={
          <>
            <button type="button" onClick={handleCancel} className="bee-btn-ghost !text-sm">
              {t("cancel")}
            </button>
            <button type="button" onClick={handleSaveDraft} disabled={!dirty} className="bee-btn-ghost !text-sm">
              {t("draft.save")}
            </button>
          </>
        }
      />
      <form id={FORM_ID} onSubmit={handleSubmit} className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", PANES)}>
        {/* ── Left: who — same slots as view mode's LeftPane ───────────── */}
        <div className="flex flex-col gap-5 border-b border-[var(--color-divider)] px-4 py-5 sm:px-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {/* Contacto */}
          <PaneSection>
            <div className="flex items-center gap-3">
              <PersonDisc name={contactName} hue={hue} size={44} />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                {activeLead ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{activeLead.full_name}</p>
                    {!leadLocked && (
                      <button type="button" onClick={() => update({ leadId: null })} className="bee-btn-ghost !h-8 shrink-0 !text-sm">
                        {t("change")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={draft.leadFullName}
                      onChange={(e) => {
                        update({ leadFullName: e.target.value });
                        setLeadFocus(true);
                      }}
                      onFocus={() => setLeadFocus(true)}
                      onBlur={() => window.setTimeout(() => setLeadFocus(false), 120)}
                      placeholder={t("contactNamePlaceholder")}
                      aria-label={t("contactNamePlaceholder")}
                      autoComplete="off"
                      className={cn(INLINE, "text-sm font-semibold")}
                    />
                    {leadFocus && leadMatches.length > 0 && (
                      <ul className="bee-surface absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                        {leadMatches.map((l) => (
                          <li key={l.id}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickLead(l)} className={MENU_ITEM}>
                              <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{l.full_name}</span>
                              {l.title && <span className="truncate text-muted-foreground">{l.title}</span>}
                            </button>
                          </li>
                        ))}
                        {draft.leadFullName.trim() && (
                          <li className="border-t border-[var(--color-divider)]">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLeadFocus(false)} className={cn(MENU_ITEM, "font-medium")}>
                              <Plus className="size-3.5 shrink-0" />
                              {t("contactCreate", { name: draft.leadFullName.trim() })}
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {activeLead ? (
                  <p className="truncate text-sm text-muted-foreground">{[activeLead.title, activeLead.seniority].filter(Boolean).join(" · ") || "—"}</p>
                ) : (
                  <div className="flex gap-2">
                    <input value={draft.leadTitle} onChange={(e) => update({ leadTitle: e.target.value })} placeholder={t("contactTitle")} aria-label={t("contactTitle")} className={cn(INLINE, "text-sm")} />
                    <input value={draft.leadSeniority} onChange={(e) => update({ leadSeniority: e.target.value })} placeholder={t("contactSeniority")} aria-label={t("contactSeniority")} className={cn(INLINE, "text-sm")} />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <EditRow icon={Mail} hue={hue} label={t("contactEmail")}>
                {activeLead ? (
                  <p className="truncate">{activeLead.email ?? "—"}</p>
                ) : (
                  <input value={draft.leadEmail} onChange={(e) => update({ leadEmail: e.target.value })} type="email" placeholder={t("contactEmailPlaceholder")} aria-label={t("contactEmail")} className={INLINE} />
                )}
              </EditRow>
              <EditRow icon={Phone} hue={hue} label={t("contactPhone")}>
                {activeLead ? (
                  <p className="truncate">{activeLead.phone ?? "—"}</p>
                ) : (
                  <input value={draft.leadPhone} onChange={(e) => update({ leadPhone: e.target.value })} type="tel" placeholder="+52 55 0000 0000" aria-label={t("contactPhone")} className={INLINE} />
                )}
              </EditRow>
              <EditRow icon={ExternalLink} hue={hue} label={t("contactLinkedin")}>
                {activeLead ? (
                  <p className="truncate">{activeLead.linkedin_url?.replace(/^https?:\/\/(www\.)?/, "") ?? "—"}</p>
                ) : (
                  <input value={draft.leadLinkedin} onChange={(e) => update({ leadLinkedin: e.target.value })} type="url" placeholder="https://linkedin.com/in/…" aria-label={t("contactLinkedin")} className={INLINE} />
                )}
              </EditRow>
              <EditRow icon={Radio} hue={hue} label={t("sourceLabel")}>
                <select value={draft.source} onChange={(e) => update({ source: e.target.value })} aria-label={t("sourceLabel")} className={INLINE}>
                  <option value="">{t("sourcePlaceholder")}</option>
                  {OPPORTUNITY_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`sourceOptions.${s}`)}
                    </option>
                  ))}
                </select>
              </EditRow>
            </div>
            {otherLeads.length > 0 && !leadLocked && (
              <div className="mt-4">
                <p className="bee-caption mb-1.5">{t("otherContacts")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {otherLeads.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => pickLead(l)}
                      title={l.title ?? undefined}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--color-divider)] bg-[var(--color-card)] py-0.5 pl-0.5 pr-2.5 text-sm hover:bg-[var(--color-primary)]"
                    >
                      <Avatar name={l.full_name} hue={hue} size={20} />
                      <span className="max-w-32 truncate">{l.full_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PaneSection>

          {/* Empresa */}
          <PaneSection>
            <EditRow icon={Building2} hue={hue} label={tDrawer("company")}>
              {activeCompany ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate">
                    <span className="font-medium">{activeCompany.name}</span>
                    {companyLine && <span className="text-muted-foreground"> · {companyLine}</span>}
                  </p>
                  {!companyLocked && (
                    <button type="button" onClick={clearCompany} className="bee-btn-ghost !h-8 shrink-0 !text-sm">
                      {t("change")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={draft.companyQuery}
                    onChange={(e) => {
                      update({ companyQuery: e.target.value });
                      setCompanyFocus(true);
                    }}
                    onFocus={() => setCompanyFocus(true)}
                    onBlur={() => window.setTimeout(() => setCompanyFocus(false), 120)}
                    placeholder={t("companySearchPlaceholder")}
                    aria-label={tDrawer("company")}
                    autoComplete="off"
                    required
                    className={cn(INLINE, "font-medium")}
                  />
                  {companyFocus && (companyMatches.length > 0 || draft.companyQuery.trim()) && (
                    <ul className="bee-surface absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                      {companyMatches.map((c) => (
                        <li key={c.id}>
                          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickCompany(c)} className={MENU_ITEM}>
                            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
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
            </EditRow>

            {/* The account's facts — typed for a new one, read for an existing one */}
            {activeCompany ? (
              (activeCompany.website || activeCompany.industry || activeCompany.size || activeCompany.country || activeCompany.revenue_range) && (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 pl-10">
                  <Fact label={t("companyWebsite")} value={activeCompany.website?.replace(/^https?:\/\/(www\.)?/, "")} />
                  <Fact label={t("companyIndustry")} value={activeCompany.industry} />
                  <Fact label={t("companySize")} value={activeCompany.size} />
                  <Fact label={t("companyCountry")} value={activeCompany.country} />
                  <Fact label={t("companyRevenue")} value={activeCompany.revenue_range} />
                </div>
              )
            ) : creatingCompany ? (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 pl-10">
                <input value={draft.companyDomain} onChange={(e) => update({ companyDomain: e.target.value })} placeholder={t("companyDomainPlaceholder")} aria-label={t("companyWebsite")} className={cn(INLINE, "text-sm")} />
                <input value={draft.companyLinkedin} onChange={(e) => update({ companyLinkedin: e.target.value })} type="url" placeholder="https://linkedin.com/company/…" aria-label={t("companyLinkedin")} className={cn(INLINE, "text-sm")} />
                <input value={draft.companyIndustry} onChange={(e) => update({ companyIndustry: e.target.value })} placeholder={t("companyIndustry")} aria-label={t("companyIndustry")} className={cn(INLINE, "text-sm")} />
                <select value={draft.companySize} onChange={(e) => update({ companySize: e.target.value })} aria-label={t("companySize")} className={cn(INLINE, "text-sm", !draft.companySize && "text-[var(--color-text-muted)]")}>
                  <option value="">{t("companySize")}</option>
                  {EMPLOYEE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input value={draft.companyCountry} onChange={(e) => update({ companyCountry: e.target.value })} placeholder={t("companyCountry")} aria-label={t("companyCountry")} className={cn(INLINE, "text-sm")} />
                <input value={draft.companySites} onChange={(e) => update({ companySites: e.target.value })} placeholder={t("companySites")} aria-label={t("companySites")} className={cn(INLINE, "text-sm")} />
                {companySites.length > 0 && (
                  <div className="col-span-2 flex flex-wrap gap-1.5">
                    {companySites.map((s) => (
                      <span key={s} className="rounded-full border border-[var(--color-divider)] px-2.5 py-0.5 text-sm">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Resumen de BEE — right under the website; only what exists */}
            <div className="mt-3 flex items-start gap-3">
              <IconDisc icon={Sparkles} hue={hue} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="bee-caption">{t("summary.title")}</p>
                <p className={cn("line-clamp-3 text-sm", (!activeCompany || !activeCompany.description) && "text-muted-foreground")}>{summary}</p>
              </div>
            </div>
          </PaneSection>

          {/* Monto — the one green box, same as view mode (SALES palette) */}
          <div className="flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3" style={{ background: mix(SALES.mint, 60) }}>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="bee-caption font-medium text-[var(--color-text)]">{stageWord}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold">{t("estimatedValuePlaceholder")}</span>
                <input
                  value={draft.amount}
                  onChange={(e) => update({ amount: e.target.value })}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  aria-label={t("estimatedValueLabel")}
                  className={cn(INLINE, "text-lg font-bold tabular-nums")}
                />
              </div>
              <label className="bee-caption mt-1 flex items-center gap-1.5">
                <span className="shrink-0">{t("expectedCloseLabel")}</span>
                <input value={draft.expectedClose} onChange={(e) => update({ expectedClose: e.target.value })} type="date" className={cn(INLINE, "text-sm")} />
              </label>
              <p className="bee-caption mt-1 truncate tabular-nums">
                {t("expectedValue")} ·{" "}
                {closeRate ? (
                  <>
                    {expectedValue != null && <span className="font-semibold text-[var(--color-text)]">{formatMoney(expectedValue, "USD", locale)} · </span>}
                    {t("expectedValueRate", { pct: Math.round(closeRate.rate * 100), count: closeRate.n })}
                  </>
                ) : (
                  t("expectedValueNoSample")
                )}
              </p>
            </div>
            <select value={draft.opportunityType} onChange={(e) => update({ opportunityType: e.target.value as OpportunityType })} aria-label={t("typeLabel")} className="bee-input !h-8 !w-auto max-w-36 !text-sm" style={{ borderColor: SALES.won }}>
              {OPPORTUNITY_TYPES.map((ot) => (
                <option key={ot} value={ot}>
                  {opportunityTypeLabels[ot]}
                </option>
              ))}
            </select>
          </div>

          {/* Responsable */}
          <PaneSection>
            <div className="flex items-center gap-3">
              <PersonDisc name={owner?.full_name} hue={hue} size={32} photoUrl={owner?.avatar_url} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="bee-caption">{t("ownerLabel")}</p>
                <select value={draft.assignedTo} onChange={(e) => update({ assignedTo: e.target.value })} aria-label={t("ownerLabel")} className={cn(INLINE, "text-sm font-medium")}>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </PaneSection>

          {/* Prioridad — lavender track, the drawer's hue on the chosen step; the slot where view mode shows the score */}
          <PaneSection
            className="flex flex-1 flex-col"
            title={t("priority")}
            aside={<ProgressRing value={draft.score / 100} size={36} stroke={4} color={hue} label={`${t("priority")} ${draft.score}`} />}
          >
            <div role="group" aria-label={t("priority")} className="grid grid-cols-3 gap-1">
              {PRIORITY_STEPS.map((step) => {
                const active = step.key === priorityStep.key;
                return (
                  <button
                    key={step.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ score: step.score })}
                    className={cn("h-8 rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] hover:brightness-95", active && "font-semibold")}
                    style={{ background: active ? hue : DATA.lavender }}
                  >
                    {t(`priorityLevels.${step.key}`)}
                  </button>
                );
              })}
            </div>
          </PaneSection>
        </div>

        {/* ── Right: the deal — same slots as view mode's RightPane ─────── */}
        <div className="flex flex-col gap-4 px-4 pt-5 sm:px-6 lg:overflow-y-auto">
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="bee-eyebrow truncate">
                {tDrawer("pipeline")} · {t("stageLabel")}: {stageWord}
              </p>
              <select value={draft.signalType} onChange={(e) => update({ signalType: e.target.value as SignalType })} aria-label={t("signalType")} className="bee-input !h-8 !w-auto max-w-48 !text-sm">
                {signalTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={companyLabel ? t("dealTitlePlaceholder", { company: companyLabel }) : t("dealTitle")}
              aria-label={t("dealTitle")}
              className={cn(INLINE, "bee-display")}
            />
          </header>

          <StageStepper status={draft.stage} closedLabel={null} onMove={(s) => update({ stage: s as StartStage })} allowed={START_STAGES} />

          {/* Why · next meeting · meetings held — the next-step strip's slot */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-card)]">
            <div className="flex items-start gap-3 px-4 py-3">
              <IconDisc icon={MessageSquareText} hue={hue} />
              <textarea
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
                aria-label={t("descriptionLabel")}
                required
                rows={3}
                className={cn(INLINE, "resize-none text-sm leading-snug")}
              />
            </div>
            <div className="grid grid-cols-1 border-t border-[var(--color-divider)] sm:grid-cols-2">
              <div className="flex items-center gap-3 px-4 py-3">
                <IconDisc icon={CalendarClock} hue={hue} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="bee-caption">{t("nextMeetingLabel")}</p>
                  <input value={draft.nextMeetingAt} onChange={(e) => update({ nextMeetingAt: e.target.value })} type="datetime-local" aria-label={t("nextMeetingLabel")} className={cn(INLINE, "text-sm")} />
                </div>
              </div>
              <div className="flex items-center gap-3 border-t border-[var(--color-divider)] px-4 py-3 sm:border-l sm:border-t-0">
                <IconDisc icon={Users} hue={hue} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="bee-caption">{t("meetingsHeldLabel")}</p>
                  <input value={draft.meetingsHeldCount} onChange={(e) => update({ meetingsHeldCount: e.target.value })} type="number" min="0" step="1" placeholder="0" aria-label={t("meetingsHeldLabel")} className={cn(INLINE, "text-sm tabular-nums")} />
                </div>
              </div>
            </div>
          </div>

          {/* Cuenta — the company's opportunities as charts, this draft included */}
          <div className="grid min-h-64 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bee-surface flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="bee-card-title !mb-0">{tDrawer("account.title")}</p>
                <span className="bee-caption">{tDrawer("account.byStage", { count: accountOpps.length + 1 })}</span>
              </div>
              <HorizontalFunnel rows={funnelRows} />
              <p className="bee-caption">{!activeCompany ? t("charts.pickCompany") : accountOpps.length === 0 ? t("charts.first") : companyLabel}</p>
            </div>
            <div className="bee-surface flex flex-col gap-3 p-4">
              <p className="bee-card-title !mb-0">{tDrawer("account.amounts")}</p>
              {hasAmounts ? (
                <BarsVsTarget
                  points={monthly}
                  minHeight={120}
                  formatValue={(v) => formatMoney(v, "USD", locale, true)}
                  colorFor={(p) => (p.current ? SALES.won : SALES.mint)}
                />
              ) : (
                <div className="bee-fill grid place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)]">
                  <p className="bee-caption px-4 text-center">{t("charts.noAmount")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Contactos de la cuenta — real leads only */}
          <div className="flex items-center gap-3">
            <IconDisc icon={Users} hue={hue} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="bee-caption">{t("accountContacts", { count: companyLeads.length })}</p>
              {companyLeads.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {companyLeads.slice(0, MAX_CHIPS).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => !leadLocked && pickLead(l)}
                      disabled={leadLocked}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--color-divider)] py-0.5 pl-0.5 pr-2.5 text-sm hover:bg-[var(--color-primary)] disabled:cursor-default"
                      style={{ background: l.id === activeLead?.id ? DATA.lavender : "var(--color-card)" }}
                    >
                      <Avatar name={l.full_name} hue={hue} size={20} />
                      <span className="max-w-32 truncate">{l.full_name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{activeCompany ? t("noAccountContacts") : t("charts.pickCompany")}</p>
              )}
            </div>
          </div>

          {/* Footer: the draft's state · the one primary action */}
          <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-divider)] bg-[var(--color-background)] px-4 py-3 sm:-mx-6 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {savedAt && (
                <>
                  <span className="bee-caption truncate font-medium" style={{ color: mix(hue, 65, "var(--color-text)") }}>
                    {t("draft.saved", { time: formatRelativeTime(savedAt, locale, new Date(now)) })}
                  </span>
                  <button type="button" onClick={discardDraft} className="bee-btn-text !text-sm">
                    {t("draft.discard")}
                  </button>
                </>
              )}
            </div>
            <button type="submit" form={FORM_ID} disabled={!canSubmit} className="bee-btn bee-btn--primary !text-sm" style={{ background: SALES.won, borderColor: SALES.won, color: "var(--color-card)" }}>
              {busy ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
