"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { InitialsDisc } from "@/features/companies/table-bits";
import { Pill } from "@/features/crm/drawer/primitives";
import { useLeadDuplicates, useMergeLeads } from "@/hooks/queries/use-leads";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import type { Lead } from "@/types/domain";

function GroupRows({ groupKey, leads }: { groupKey: string; leads: Lead[] }) {
  const mergeLeads = useMergeLeads();
  const locale = useLocale() as Locale;
  const t = useTranslations("sharedB.leadDuplicates");
  const tDedup = useTranslations("companiesLeads.dedup");
  const sorted = [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [keepId, setKeepId] = useState(sorted[0].id);

  async function handleMerge() {
    const rest = leads.filter((l) => l.id !== keepId);
    for (const dup of rest) {
      await mergeLeads.mutateAsync({ keepId, mergeId: dup.id });
    }
  }

  return (
    <div className="border-t border-[var(--color-divider)] pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="bee-caption">
          {t("sameEmail")} <span className="font-medium text-[var(--color-text)]">{groupKey}</span>
        </p>
        <button type="button" onClick={handleMerge} disabled={mergeLeads.isPending} className="bee-btn bee-btn--primary">
          {mergeLeads.isPending ? t("merging") : t("mergeButton")}
        </button>
      </div>
      {leads.map((l) => (
        <div key={l.id} className="bee-row">
          <InitialsDisc name={l.full_name} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{l.full_name}</p>
            <p className="bee-micro">{t("createdOn", { date: formatDate(l.created_at, locale) })}</p>
          </div>
          <Pill pressed={keepId === l.id} onClick={() => setKeepId(l.id)}>
            {tDedup("keep")}
          </Pill>
        </div>
      ))}
    </div>
  );
}

/** Contactos que probablemente son la misma persona duplicada — mismo email
 *  en más de un registro, sin importar la empresa. Self-hides when there is
 *  nothing to merge. */
export function LeadDuplicatesPanel() {
  const t = useTranslations("sharedB.leadDuplicates");
  const tDedup = useTranslations("companiesLeads.dedup");
  const { data: result } = useLeadDuplicates();
  const groups = result?.data ?? [];

  if (groups.length === 0) return null;

  return (
    <OverviewCard span={12} title={t("heading", { count: groups.length })} caption={tDedup("leadsCaption")}>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupRows key={g.key} groupKey={g.key} leads={g.leads} />
        ))}
      </div>
    </OverviewCard>
  );
}
