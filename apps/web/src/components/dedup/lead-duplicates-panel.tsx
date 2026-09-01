"use client";

import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useLeadDuplicates, useMergeLeads } from "@/hooks/queries/use-leads";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import type { Lead } from "@/types/domain";

function GroupRow({ groupKey, leads }: { groupKey: string; leads: Lead[] }) {
  const mergeLeads = useMergeLeads();
  const locale = useLocale() as Locale;
  const t = useTranslations("sharedB.leadDuplicates");
  const sorted = [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [keepId, setKeepId] = useState(sorted[0].id);

  async function handleMerge() {
    const rest = leads.filter((l) => l.id !== keepId);
    for (const dup of rest) {
      await mergeLeads.mutateAsync({ keepId, mergeId: dup.id });
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {t("sameEmail")} <span className="font-mono">{groupKey}</span>
      </p>
      <div className="space-y-1.5">
        {leads.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name={`keep-lead-${groupKey}`}
              checked={keepId === l.id}
              onChange={() => setKeepId(l.id)}
              className="accent-[var(--color-chart-4)]"
            />
            <span className="font-medium">{l.full_name}</span>
            <span className="text-muted-foreground">
              · {t("createdOn", { date: formatDate(l.created_at, locale) })}
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={handleMerge}
        disabled={mergeLeads.isPending}
        className="bee-btn bee-btn--primary mt-3 text-xs"
      >
        {mergeLeads.isPending ? t("merging") : t("mergeButton")}
      </button>
    </div>
  );
}

/** Contactos que probablemente son la misma persona duplicada — mismo email
 *  en más de un registro, sin importar la empresa. */
export function LeadDuplicatesPanel() {
  const t = useTranslations("sharedB.leadDuplicates");
  const { data: result } = useLeadDuplicates();
  const groups = result?.data ?? [];

  if (groups.length === 0) return null;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-chart-1)]/40 bg-[var(--color-chart-1)]/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-[var(--color-chart-1)]" />
        <p className="text-sm font-semibold">
          {t("heading", { count: groups.length })}
        </p>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <GroupRow key={g.key} groupKey={g.key} leads={g.leads} />
        ))}
      </div>
    </div>
  );
}
