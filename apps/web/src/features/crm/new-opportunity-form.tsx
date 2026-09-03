"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCreateOpportunity } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import type { SignalType } from "@/types/domain";

const INPUT_CLASS =
  "rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]";

// Same set LeadCreateIn's own "de dónde salió" field uses (see
// company-detail.tsx's NewContactForm) — one taxonomy for "where did this
// come from" across leads and opportunities, not two that could drift.
const OPPORTUNITY_SOURCES = ["referral", "inbound", "outbound", "event", "cold_call", "other"] as const;

/**
 * Alta manual de una oportunidad — el "+ Nueva oportunidad" del CRM y de la
 * ficha de empresa. Un único formulario resuelve-o-crea la empresa y el
 * contacto (igual que la ingesta automática por señal) y dispara la misma
 * generación de estrategia con IA — ver `POST /opportunities`.
 *
 * `company`, cuando se pasa (desde la ficha de empresa), precarga y bloquea
 * los campos de empresa: ya sabemos exactamente cuál es, así que no tiene
 * sentido dejar que el nombre/dominio diverjan de lo que ya existe.
 */
export function NewOpportunityForm({
  company,
  onDone,
}: {
  company?: { name: string; domain: string | null };
  onDone: () => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("crm.form");
  const signalTypeOptions = Object.entries(getSignalTypeLabels(locale)) as [SignalType, string][];
  const createOpportunity = useCreateOpportunity();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [companyName, setCompanyName] = useState(company?.name ?? "");
  const [companyDomain, setCompanyDomain] = useState(company?.domain ?? "");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [leadFullName, setLeadFullName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [signalType, setSignalType] = useState<SignalType>("other");
  const [description, setDescription] = useState("");
  const [score, setScore] = useState(50);
  // Deal context — optional, same fields (and same intent) as Leads' own
  // NewContactForm: background a rep already has that the AI can't infer.
  const [estimatedValue, setEstimatedValue] = useState("");
  const [source, setSource] = useState("");
  const [nextMeetingAt, setNextMeetingAt] = useState("");
  const [meetingsHeldCount, setMeetingsHeldCount] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const companyLocked = Boolean(company);

  function reset() {
    setCompanyName(company?.name ?? "");
    setCompanyDomain(company?.domain ?? "");
    setCompanyIndustry("");
    setLeadFullName("");
    setLeadEmail("");
    setLeadTitle("");
    setSignalType("other");
    setDescription("");
    setScore(50);
    setEstimatedValue("");
    setSource("");
    setNextMeetingAt("");
    setMeetingsHeldCount("");
    setPhotoUrl("");
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again after a change
    if (!file) return;
    try {
      setPhotoUrl(await resizeImageToDataUrl(file));
    } catch {
      toast.error(t("errorToast"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !description.trim()) return;
    try {
      await createOpportunity.mutateAsync({
        company_name: companyName.trim(),
        company_domain: companyDomain.trim() || undefined,
        company_industry: companyIndustry.trim() || undefined,
        lead_full_name: leadFullName.trim() || undefined,
        lead_email: leadEmail.trim() || undefined,
        lead_title: leadTitle.trim() || undefined,
        signal_type: signalType,
        description: description.trim(),
        score,
        amount: estimatedValue ? Number(estimatedValue) : undefined,
        source: source || undefined,
        next_meeting_at: nextMeetingAt ? new Date(nextMeetingAt).toISOString() : undefined,
        meetings_held_count: meetingsHeldCount ? Number(meetingsHeldCount) : undefined,
        photo_url: photoUrl || undefined,
      });
      toast.success(t("successToast"));
      reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorToast"));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </p>

      {!companyLocked && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("companyName")}
            required
            className={INPUT_CLASS}
          />
          <input
            value={companyDomain}
            onChange={(e) => setCompanyDomain(e.target.value)}
            placeholder={t("companyDomain")}
            className={INPUT_CLASS}
          />
          <input
            value={companyIndustry}
            onChange={(e) => setCompanyIndustry(e.target.value)}
            placeholder={t("companyIndustry")}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div className="mb-2 flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a client-resized data: URI, not an optimizable remote asset
            <img src={photoUrl} alt="" className="size-14 rounded-full object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-full bg-[var(--color-card)] text-xs text-muted-foreground">
              {t("photoLabel")}
            </span>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
          <button type="button" onClick={() => photoInputRef.current?.click()} className="bee-btn-ghost text-xs">
            {photoUrl ? t("photoChange") : t("photoUpload")}
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={leadFullName}
            onChange={(e) => setLeadFullName(e.target.value)}
            placeholder={t("contactName")}
            className={INPUT_CLASS}
          />
          <input
            value={leadTitle}
            onChange={(e) => setLeadTitle(e.target.value)}
            placeholder={t("contactTitle")}
            className={INPUT_CLASS}
          />
          <input
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            placeholder={t("contactEmail")}
            type="email"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          value={estimatedValue}
          onChange={(e) => setEstimatedValue(e.target.value)}
          placeholder={`${t("estimatedValueLabel")} (${t("estimatedValuePlaceholder")})`}
          type="number"
          min="0"
          step="any"
          className={INPUT_CLASS}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={t("sourceLabel")} className={INPUT_CLASS}>
          <option value="">{t("sourcePlaceholder")}</option>
          {OPPORTUNITY_SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`sourceOptions.${s}`)}
            </option>
          ))}
        </select>
        <input
          value={nextMeetingAt}
          onChange={(e) => setNextMeetingAt(e.target.value)}
          aria-label={t("nextMeetingLabel")}
          title={t("nextMeetingLabel")}
          type="datetime-local"
          className={INPUT_CLASS}
        />
        <input
          value={meetingsHeldCount}
          onChange={(e) => setMeetingsHeldCount(e.target.value)}
          placeholder={t("meetingsHeldLabel")}
          type="number"
          min="0"
          step="1"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <select
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
          aria-label={t("signalType")}
          className={INPUT_CLASS}
        >
          {signalTypeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className={`flex items-center gap-2 ${INPUT_CLASS}`}>
          <label htmlFor="new-opp-score" className="shrink-0 text-xs text-muted-foreground">
            {t("priority")}
          </label>
          <input
            id="new-opp-score"
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="accent-[var(--color-chart-4)]"
          />
          <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums">{score}</span>
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        required
        rows={2}
        className={`w-full resize-none ${INPUT_CLASS}`}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!companyName.trim() || !description.trim() || createOpportunity.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createOpportunity.isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
