"use client";

import { useTranslations } from "next-intl";

import { TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";

export interface BurnoutLead {
  id: string;
  label: string;
}

/**
 * Shown only when the market itself is genuinely quiet this week (well
 * below the account's own trailing average — a real comparison, not a
 * decorative one), and only when there are real hot accounts to name. No
 * red, no "you're behind": the copy stays about the market being slow,
 * never about the person, and the suggestion is always a real account
 * already in the hive, never a placeholder.
 */
export function AntiBurnoutCard({ leads }: { leads: BurnoutLead[] }) {
  const t = useTranslations("celebration.burnout");
  if (leads.length === 0) return null;
  return (
    <OverviewCard span={12} title={t("title")} caption={t("text")} className="lg:min-h-0!">
      <ul className="flex flex-wrap gap-2">
        {leads.map((l) => (
          <li key={l.id} className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--color-text)]" style={{ background: tint(TONE.market, 45) }}>
            {l.label}
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}
