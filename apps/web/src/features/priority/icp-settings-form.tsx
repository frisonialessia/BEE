"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { TONE, tint } from "@/components/charts/palette";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { useUpdateIcpCriteria } from "@/hooks/queries/use-icp";
import type { IcpCriteria } from "@/lib/api/organizations";

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** A comma-separated list field in the dialog language: caption label over
 *  a grey `.bee-input`, and the values already in the data as toggle pills
 *  that add or remove themselves from the list. */
function ListField({
  label,
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const current = fromCsv(value);
  const toggle = (item: string) => {
    const has = current.includes(item);
    onChange(toCsv(has ? current.filter((v) => v !== item) : [...current, item]));
  };
  return (
    <div className="min-w-0">
      <Field label={label}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bee-input" />
      </Field>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Pill key={s} pressed={current.includes(s)} fill={tint(TONE.urgency, 45)} onClick={() => toggle(s)}>
              {s}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}

/** Formulario del Perfil de Cliente Ideal — listas separadas por coma.
 *  Una dimensión vacía significa "no me importa", no "nada califica" (ver
 *  lib/icp.ts computeFitScore). Cubre tanto firmográficos de la cuenta
 *  (industria/tamaño/país/ingresos) como el buyer persona real dentro de
 *  esa cuenta (cargo/seniority) y señales de stack tecnológico. */
export function IcpSettingsForm({
  initial,
  suggestions,
  onDone,
}: {
  initial: IcpCriteria;
  suggestions: {
    industries: string[];
    sizes: string[];
    countries: string[];
    revenueRanges: string[];
    seniorities: string[];
  };
  onDone: () => void;
}) {
  const t = useTranslations("opportunitiesPriority.icpForm");
  const updateIcp = useUpdateIcpCriteria();
  const [industries, setIndustries] = useState(toCsv(initial.industries));
  const [sizes, setSizes] = useState(toCsv(initial.sizes));
  const [countries, setCountries] = useState(toCsv(initial.countries));
  const [revenueRanges, setRevenueRanges] = useState(toCsv(initial.revenue_ranges));
  const [jobTitles, setJobTitles] = useState(toCsv(initial.job_titles));
  const [seniorities, setSeniorities] = useState(toCsv(initial.seniorities));
  const [techKeywords, setTechKeywords] = useState(toCsv(initial.tech_keywords));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateIcp.mutateAsync({
        industries: fromCsv(industries),
        sizes: fromCsv(sizes),
        countries: fromCsv(countries),
        revenue_ranges: fromCsv(revenueRanges),
        job_titles: fromCsv(jobTitles),
        seniorities: fromCsv(seniorities),
        tech_keywords: fromCsv(techKeywords),
      });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ListField label={t("industries.label")} value={industries} onChange={setIndustries} placeholder={t("industries.placeholder")} suggestions={suggestions.industries} />
        <ListField label={t("sizes.label")} value={sizes} onChange={setSizes} placeholder={t("sizes.placeholder")} suggestions={suggestions.sizes} />
        <ListField label={t("countries.label")} value={countries} onChange={setCountries} placeholder={t("countries.placeholder")} suggestions={suggestions.countries} />
        <ListField label={t("revenueRanges.label")} value={revenueRanges} onChange={setRevenueRanges} placeholder={t("revenueRanges.placeholder")} suggestions={suggestions.revenueRanges} />
      </div>

      {/* Buyer persona: not just "which accounts", also "who at that
          account" — cargo/seniority se validan contra los Leads reales de
          la cuenta, no contra la Company (ver computeFitScore). */}
      <p className="bee-caption border-t border-[var(--color-divider)] pt-4">{t("buyerPersonaLabel")}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ListField label={t("jobTitles.label")} value={jobTitles} onChange={setJobTitles} placeholder={t("jobTitles.placeholder")} />
        <ListField label={t("seniorities.label")} value={seniorities} onChange={setSeniorities} placeholder={t("seniorities.placeholder")} suggestions={suggestions.seniorities} />
        <ListField label={t("techKeywords.label")} value={techKeywords} onChange={setTechKeywords} placeholder={t("techKeywords.placeholder")} />
      </div>

      <p className="bee-micro">{t("help")}</p>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-divider)] pt-4">
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
        <button type="submit" disabled={updateIcp.isPending} className="bee-btn bee-btn--primary">
          {updateIcp.isPending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
