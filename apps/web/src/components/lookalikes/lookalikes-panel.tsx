"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { TONE, heat } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { InitialsDisc } from "@/features/companies/table-bits";
import { useLookalikeCompanies } from "@/hooks/queries/use-companies";
import { useDashboardBase } from "@/lib/demo/mode";

/** "Companies like your best customers" — BEE's own closed-loop learning
 * surfaced as a shortlist: untapped companies it's already tracking that
 * resemble the accounts that actually closed for this org (see
 * LookalikeService on the backend). Rows with a similarity bar in honey —
 * the number only on hover. Self-hides — same "nothing rather than a
 * placeholder" convention as CompanyDuplicatesPanel — both while data is
 * loading and for any org that doesn't have both a won deal and an untapped
 * prospect to compare against yet. */
export function LookalikesPanel() {
  const t = useTranslations("sharedB.lookalikes");
  const base = useDashboardBase();
  const { data: result } = useLookalikeCompanies();
  const companies = result?.data ?? [];
  const [hover, setHover] = useState<string | null>(null);

  if (companies.length === 0) return null;

  return (
    <OverviewCard span={12} title={t("heading", { count: companies.length })} caption={t("subtitle")}>
      <div className="flex flex-col">
        {companies.map((c) => (
          <Link
            key={c.company_id}
            href={`${base}/companies/${c.company_id}`}
            onMouseEnter={() => setHover(c.company_id)}
            onMouseLeave={() => setHover(null)}
            className="bee-row relative transition-colors hover:bg-[var(--color-primary)]/20"
          >
            <InitialsDisc name={c.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="bee-caption truncate">{[c.industry, c.size, c.country].filter(Boolean).join(" · ") || t("noProfile")}</p>
            </div>
            <div className="h-2.5 w-28 shrink-0 overflow-hidden rounded-full sm:w-40" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round(c.similarity * 100))}%`, background: heat(TONE.market, c.similarity) }} />
            </div>
            {hover === c.company_id && (
              <span className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-[130%] whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)]">
                {Math.round(c.similarity * 100)}%
              </span>
            )}
          </Link>
        ))}
      </div>
    </OverviewCard>
  );
}
