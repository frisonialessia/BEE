"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useLookalikeCompanies } from "@/hooks/queries/use-companies";
import { useIsDemoMode } from "@/lib/demo/mode";

/** "Companies like your best customers" — BEE's own closed-loop learning
 * surfaced as a shortlist: untapped companies it's already tracking that
 * resemble the accounts that actually closed for this org (see
 * LookalikeService on the backend). Self-hides — same "nothing rather than
 * a placeholder" convention as CompanyDuplicatesPanel — both while data is
 * loading and for any org that doesn't have both a won deal and an untapped
 * prospect to compare against yet, so a brand-new account never sees an
 * empty box explaining a feature it can't use yet. */
export function LookalikesPanel() {
  const t = useTranslations("sharedB.lookalikes");
  const demo = useIsDemoMode();
  const { data: result } = useLookalikeCompanies();
  const companies = result?.data ?? [];

  if (companies.length === 0) return null;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/10 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--color-text)]" />
        <p className="text-sm font-semibold">{t("heading", { count: companies.length })}</p>
      </div>
      <p className="bee-caption mb-3">{t("subtitle")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {companies.map((c) => (
          <Link
            key={c.company_id}
            href={`${demo ? "/probar" : "/dashboard"}/companies/${c.company_id}`}
            className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] p-3 transition-colors hover:border-[var(--color-chart-4)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-chart-4)]/20 px-2 py-1 text-micro font-medium text-[var(--color-text)]">
                {Math.round(c.similarity * 100)}%
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {[c.industry, c.size, c.country].filter(Boolean).join(" · ") || t("noProfile")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
