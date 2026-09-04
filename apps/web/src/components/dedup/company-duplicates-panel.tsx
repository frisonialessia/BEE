"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { InitialsDisc } from "@/features/companies/table-bits";
import { Pill } from "@/features/crm/drawer/primitives";
import { useCompanyDuplicates, useMergeCompanies } from "@/hooks/queries/use-companies";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import type { Company } from "@/types/domain";

function GroupRows({ groupKey, companies }: { groupKey: string; companies: Company[] }) {
  const mergeCompanies = useMergeCompanies();
  const locale = useLocale() as Locale;
  const t = useTranslations("sharedB.companyDuplicates");
  const tDedup = useTranslations("companiesLeads.dedup");
  // Por defecto se conserva la más antigua — suele ser la que ya tiene más
  // actividad relacionada (leads, oportunidades, señales) acumulada.
  const sorted = [...companies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [keepId, setKeepId] = useState(sorted[0].id);

  async function handleMerge() {
    const rest = companies.filter((c) => c.id !== keepId);
    for (const dup of rest) {
      await mergeCompanies.mutateAsync({ keepId, mergeId: dup.id });
    }
  }

  return (
    <div className="border-t border-[var(--color-divider)] pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="bee-caption">
          {companies[0].domain ? t("sameDomain") : t("sameName")} <span className="font-medium text-[var(--color-text)]">{groupKey}</span>
        </p>
        <button type="button" onClick={handleMerge} disabled={mergeCompanies.isPending} className="bee-btn bee-btn--primary">
          {mergeCompanies.isPending ? t("merging") : t("mergeButton")}
        </button>
      </div>
      {companies.map((c) => (
        <div key={c.id} className="bee-row">
          <InitialsDisc name={c.name} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="bee-micro">{t("createdOn", { date: formatDate(c.created_at, locale) })}</p>
          </div>
          <Pill pressed={keepId === c.id} onClick={() => setKeepId(c.id)}>
            {tDedup("keep")}
          </Pill>
        </div>
      ))}
    </div>
  );
}

/** Empresas que probablemente son la misma cuenta duplicada — mismo dominio
 *  (o nombre, si ninguna tiene dominio) en más de un registro. No se borra
 *  nada solo: el rep elige cuál conservar y fusiona a demanda. Self-hides
 *  when there is nothing to merge. */
export function CompanyDuplicatesPanel() {
  const t = useTranslations("sharedB.companyDuplicates");
  const tDedup = useTranslations("companiesLeads.dedup");
  const { data: result } = useCompanyDuplicates();
  const groups = result?.data ?? [];

  if (groups.length === 0) return null;

  return (
    <OverviewCard span={12} title={t("heading", { count: groups.length })} caption={tDedup("companiesCaption")}>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupRows key={g.key} groupKey={g.key} companies={g.companies} />
        ))}
      </div>
    </OverviewCard>
  );
}
