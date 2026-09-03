"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

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
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </p>
      <p className="bee-caption mb-3">{t("subtitle")}</p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("industries.label")}</label>
          <input
            value={industries}
            onChange={(e) => setIndustries(e.target.value)}
            placeholder={t("industries.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.industries.length > 0 && (
            <p className="mt-1 bee-micro">
              {t("alreadyUsing", { values: suggestions.industries.join(", ") })}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("sizes.label")}</label>
          <input
            value={sizes}
            onChange={(e) => setSizes(e.target.value)}
            placeholder={t("sizes.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.sizes.length > 0 && (
            <p className="mt-1 bee-micro">{t("alreadyUsing", { values: suggestions.sizes.join(", ") })}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("countries.label")}</label>
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder={t("countries.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.countries.length > 0 && (
            <p className="mt-1 bee-micro">
              {t("alreadyUsing", { values: suggestions.countries.join(", ") })}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("revenueRanges.label")}
          </label>
          <input
            value={revenueRanges}
            onChange={(e) => setRevenueRanges(e.target.value)}
            placeholder={t("revenueRanges.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.revenueRanges.length > 0 && (
            <p className="mt-1 bee-micro">
              {t("alreadyUsing", { values: suggestions.revenueRanges.join(", ") })}
            </p>
          )}
        </div>

        {/* Buyer persona: no longer just "which accounts", also "who at
         * that account" — cargo/seniority se validan contra los Leads
         * reales de la cuenta, no contra la Company (ver computeFitScore). */}
        <div className="border-t border-dashed border-border pt-3">
          <p className="bee-micro font-medium uppercase tracking-wide text-muted-foreground">
            {t("buyerPersonaLabel")}
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("jobTitles.label")}</label>
          <input
            value={jobTitles}
            onChange={(e) => setJobTitles(e.target.value)}
            placeholder={t("jobTitles.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("seniorities.label")}</label>
          <input
            value={seniorities}
            onChange={(e) => setSeniorities(e.target.value)}
            placeholder={t("seniorities.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.seniorities.length > 0 && (
            <p className="mt-1 bee-micro">
              {t("alreadyUsing", { values: suggestions.seniorities.join(", ") })}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("techKeywords.label")}
          </label>
          <input
            value={techKeywords}
            onChange={(e) => setTechKeywords(e.target.value)}
            placeholder={t("techKeywords.placeholder")}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={updateIcp.isPending} className="bee-btn bee-btn--primary">
          {updateIcp.isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
