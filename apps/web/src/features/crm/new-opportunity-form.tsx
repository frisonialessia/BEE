"use client";

import { Building2, Check, Plus, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useCreateOpportunity } from "@/hooks/queries/use-opportunities";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { getOpportunityTypeLabels, getSignalTypeLabels } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import type { Company, Lead, OpportunityType, SignalType } from "@/types/domain";

// Same set LeadCreateIn's own "de dónde salió" field uses (see
// company-detail.tsx's NewContactForm) — one taxonomy for "where did this
// come from" across leads and opportunities, not two that could drift.
const OPPORTUNITY_SOURCES = ["referral", "inbound", "outbound", "event", "cold_call", "other"] as const;
// Stages a person can *start* a deal in. "Listas para actuar" is BEE's own
// gate (a complete battlecard) and is never picked by hand.
const START_STAGES = ["detected", "prioritized", "in_progress"] as const;
const OPPORTUNITY_TYPES: OpportunityType[] = ["new_logo", "expansion", "renewal_risk"];
const MAX_MATCHES = 6;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="bee-micro font-medium">{label}</span>
      {children}
    </label>
  );
}

/**
 * Alta de una oportunidad — el "+ Nueva oportunidad" del CRM y de la ficha
 * de empresa. Tres pasos en un solo diálogo, cada uno ligado a lo que ya
 * existe:
 *
 *  1. Empresa: se busca entre las cuentas de Empresas y se elige, o se crea
 *     una nueva (con dominio → el backend enriquece la ficha y lanza el
 *     primer escaneo de mercado). Nunca se teclea una empresa que BEE ya
 *     sigue.
 *  2. Contacto: los leads de esa empresa, o uno nuevo que queda guardado en
 *     Leads bajo la misma cuenta.
 *  3. Oportunidad: responsable, etapa inicial, tipo, monto, cierre estimado
 *     y el contexto que alimenta la estrategia generada por la IA.
 *
 * Al guardar se abre el drawer de la oportunidad recién creada — la
 * estrategia ya está ahí, y Empresas/Leads/Pronóstico/Ranking la ven al
 * instante porque `useCreateOpportunity` invalida las tres listas.
 *
 * `company` (desde la ficha de empresa) fija el paso 1 a esa cuenta.
 */
export function NewOpportunityForm({
  open,
  onClose,
  company,
}: {
  open: boolean;
  onClose: () => void;
  company?: { id?: string; name: string; domain: string | null };
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {open && <NewOpportunityBody onDone={onClose} company={company} />}
      </DialogContent>
    </Dialog>
  );
}

function NewOpportunityBody({
  onDone,
  company: fixedCompany,
}: {
  onDone: () => void;
  company?: { id?: string; name: string; domain: string | null };
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("crm.form");
  const tStages = useTranslations("crm.board.stages");
  const signalTypeOptions = Object.entries(getSignalTypeLabels(locale)) as [SignalType, string][];
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const { user } = useAuth();
  const { data: companiesResult } = useCompanies(200);
  const { data: leadsResult } = useLeads(200);
  const { data: users } = useUsers();
  const createOpportunity = useCreateOpportunity();
  const { openOpportunity } = useOpportunityDrawer();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const leads = useMemo(() => leadsResult?.data ?? [], [leadsResult]);

  // ── 1. Company ────────────────────────────────────────────────────────
  const preselected = useMemo(
    () => (fixedCompany?.id ? companies.find((c) => c.id === fixedCompany.id) : undefined),
    [companies, fixedCompany],
  );
  const [companyQuery, setCompanyQuery] = useState(fixedCompany?.name ?? "");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyDomain, setCompanyDomain] = useState(fixedCompany?.domain ?? "");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [companyFocus, setCompanyFocus] = useState(false);
  const activeCompany = selectedCompany ?? preselected ?? null;
  const companyLocked = Boolean(fixedCompany);

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
  }

  function clearCompany() {
    setSelectedCompany(null);
    setCompanyQuery("");
    setCompanyDomain("");
    setSelectedLead(null);
    setNewLead(false);
  }

  // ── 2. Contact ────────────────────────────────────────────────────────
  const companyLeads = useMemo(
    () => (activeCompany ? leads.filter((l) => l.company_id === activeCompany.id) : []),
    [leads, activeCompany],
  );
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState(false);
  const [leadFullName, setLeadFullName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const showNewLeadFields = creatingCompany || newLead || (activeCompany !== null && companyLeads.length === 0);

  // ── 3. Deal ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState(user?.id ?? "");
  const [stage, setStage] = useState<(typeof START_STAGES)[number]>("detected");
  const [opportunityType, setOpportunityType] = useState<OpportunityType>("new_logo");
  const [amount, setAmount] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [source, setSource] = useState("");
  const [signalType, setSignalType] = useState<SignalType>("other");
  const [score, setScore] = useState(50);
  const [description, setDescription] = useState("");
  const [nextMeetingAt, setNextMeetingAt] = useState("");
  const [meetingsHeldCount, setMeetingsHeldCount] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const companyLabel = activeCompany?.name ?? companyQuery.trim();
  const canSubmit = Boolean(companyLabel) && description.trim().length > 0 && !createOpportunity.isPending;

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
        lead_id: selectedLead?.id,
        lead_full_name: selectedLead ? undefined : leadFullName.trim() || undefined,
        lead_email: selectedLead ? undefined : leadEmail.trim() || undefined,
        lead_title: selectedLead ? undefined : leadTitle.trim() || undefined,
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
      onDone();
      openOpportunity(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorToast"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("subtitle")}</DialogDescription>
      </DialogHeader>

      {/* ── 1. Empresa ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <p className="bee-eyebrow">{t("steps.company")}</p>
        {activeCompany ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-chart-4)] bg-[var(--color-card)] px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{activeCompany.name}</span>
              {activeCompany.domain && <span className="bee-micro truncate text-muted-foreground">{activeCompany.domain}</span>}
              <span className="bee-micro text-[var(--color-chart-4)]">{t("companyExisting")}</span>
            </span>
            {!companyLocked && (
              <button type="button" onClick={clearCompany} className="bee-btn-ghost text-xs">
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
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] shadow-md">
                {companyMatches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCompany(c)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-primary)]/30"
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.name}</span>
                      {c.domain && <span className="bee-micro truncate text-muted-foreground">{c.domain}</span>}
                    </button>
                  </li>
                ))}
                {companyQuery.trim() && !exactCompany && (
                  <li className="border-t border-border">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCompanyFocus(false)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-[var(--color-primary)]/30"
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("companyDomain")}>
              <input
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                placeholder="empresa.com"
                className="bee-input"
              />
            </Field>
            <Field label={t("companyIndustry")}>
              <input value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} className="bee-input" />
            </Field>
            <p className="bee-caption sm:col-span-2">{t("companyCreateHint")}</p>
          </div>
        )}
      </section>

      {/* ── 2. Contacto ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <p className="bee-eyebrow">{t("steps.contact")}</p>
        {activeCompany && companyLeads.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {companyLeads.slice(0, 8).map((l) => {
              const active = selectedLead?.id === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setSelectedLead(active ? null : l);
                    setNewLead(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-1.5 text-sm",
                    active ? "border-[var(--color-chart-4)] bg-[var(--color-primary)]/40" : "border-border bg-[var(--color-card)]",
                  )}
                >
                  {active ? <Check className="size-3.5" /> : <UserRound className="size-3.5 text-muted-foreground" />}
                  <span className="font-medium">{l.full_name}</span>
                  {l.title && <span className="bee-micro text-muted-foreground">{l.title}</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setNewLead((v) => !v);
                setSelectedLead(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed px-3 py-1.5 text-sm",
                newLead ? "border-[var(--color-chart-4)]" : "border-border",
              )}
            >
              <Plus className="size-3.5" />
              {t("contactNew")}
            </button>
          </div>
        )}
        {showNewLeadFields && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("contactName")}>
              <input value={leadFullName} onChange={(e) => setLeadFullName(e.target.value)} className="bee-input" />
            </Field>
            <Field label={t("contactTitle")}>
              <input value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} className="bee-input" />
            </Field>
            <Field label={t("contactEmail")}>
              <input value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} type="email" className="bee-input" />
            </Field>
          </div>
        )}
        {!activeCompany && !creatingCompany && <p className="bee-caption">{t("contactPickCompanyFirst")}</p>}
      </section>

      {/* ── 3. Oportunidad ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <p className="bee-eyebrow">{t("steps.deal")}</p>
        <Field label={t("dealTitle")}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={companyLabel ? t("dealTitlePlaceholder", { company: companyLabel }) : ""}
            className="bee-input"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("ownerLabel")}>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="bee-input">
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
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
          <Field label={`${t("estimatedValueLabel")} (${t("estimatedValuePlaceholder")})`}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="any" className="bee-input" />
          </Field>
          <Field label={t("expectedCloseLabel")}>
            <input value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} type="date" className="bee-input" />
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
          <Field label={t("signalType")}>
            <select value={signalType} onChange={(e) => setSignalType(e.target.value as SignalType)} className="bee-input">
              {signalTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("nextMeetingLabel")}>
            <input value={nextMeetingAt} onChange={(e) => setNextMeetingAt(e.target.value)} type="datetime-local" className="bee-input" />
          </Field>
          <Field label={t("meetingsHeldLabel")}>
            <input value={meetingsHeldCount} onChange={(e) => setMeetingsHeldCount(e.target.value)} type="number" min="0" step="1" className="bee-input" />
          </Field>
        </div>
        <Field label={`${t("priority")} · ${score}`}>
          <input
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="accent-[var(--color-chart-4)]"
          />
        </Field>
        <Field label={t("descriptionLabel")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            required
            rows={3}
            className="bee-input resize-none"
          />
        </Field>
        <div className="flex items-center gap-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a client-resized data: URI, not an optimizable remote asset
            <img src={photoUrl} alt="" className="size-10 rounded-full object-cover" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)]/40 text-micro text-muted-foreground">
              {t("photoLabel")}
            </span>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
          <button type="button" onClick={() => photoInputRef.current?.click()} className="bee-btn-ghost text-xs">
            {photoUrl ? t("photoChange") : t("photoUpload")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
        <button type="submit" disabled={!canSubmit} className="bee-btn bee-btn--primary">
          {createOpportunity.isPending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
