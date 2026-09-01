"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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

/** Formulario del Perfil de Cliente Ideal — tres listas separadas por coma.
 *  Una dimensión vacía significa "no me importa", no "nada califica" (ver
 *  lib/icp.ts computeFitScore). */
export function IcpSettingsForm({
  initial,
  suggestions,
  onDone,
}: {
  initial: IcpCriteria;
  suggestions: { industries: string[]; sizes: string[]; countries: string[] };
  onDone: () => void;
}) {
  const t = useTranslations("opportunitiesPriority.icpForm");
  const updateIcp = useUpdateIcpCriteria();
  const [industries, setIndustries] = useState(toCsv(initial.industries));
  const [sizes, setSizes] = useState(toCsv(initial.sizes));
  const [countries, setCountries] = useState(toCsv(initial.countries));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateIcp.mutateAsync({
      industries: fromCsv(industries),
      sizes: fromCsv(sizes),
      countries: fromCsv(countries),
    });
    onDone();
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

      <div className="space-y-2.5">
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
