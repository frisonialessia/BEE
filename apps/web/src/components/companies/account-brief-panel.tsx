"use client";

import { useLocale, useTranslations } from "next-intl";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyBrief, useResearchCompany } from "@/hooks/queries/use-companies";
import type { Locale } from "@/i18n/locales";
import { formatRelativeTime } from "@/lib/i18n/format";

/** Humanizes a findings dict key: "hiring_signals" -> "Hiring signals". Keys
 * come from AccountResearchAgent's LLM synthesis (or, in the sandbox, the
 * demo template) and vary by what was actually found — no fixed schema to
 * map against, so this is a generic transform, not a lookup table. */
function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * AccountBriefPanel — AccountResearchAgent's LLM-synthesized account brief,
 * as one box of the company page: the summary, the findings as hairline
 * rows, the sources and when it was generated. The research action sits in
 * the card's corner.
 *
 * ACCOUNT_RESEARCH_ENABLED defaults to false in production (see
 * DEPLOY_CHECKLIST.md §3.9) — the `disabled` flag on the research result
 * is handled explicitly here instead of showing a broken/empty state.
 */
export function AccountBriefPanel({ companyId, span = 6 }: { companyId: string; span?: 4 | 6 | 12 }) {
  const t = useTranslations("companiesLeads.companyDetail.accountBrief");
  const locale = useLocale() as Locale;
  const { data: briefResult, isLoading } = useCompanyBrief(companyId);
  const research = useResearchCompany();

  const brief = research.data?.brief ?? briefResult?.data ?? null;
  const disabled = research.data?.disabled ?? false;
  const budgetExceeded = research.data?.budget_exceeded ?? false;

  return (
    <OverviewCard
      span={span}
      title={t("heading")}
      caption={brief ? t("generatedAt", { time: formatRelativeTime(brief.created_at, locale) }) : t("caption")}
      action={
        <button type="button" onClick={() => research.mutate({ companyId, force: Boolean(brief) })} disabled={research.isPending || disabled} className="bee-caption whitespace-nowrap font-medium text-[var(--color-text)] hover:underline disabled:opacity-50">
          {research.isPending ? t("researching") : brief ? t("researchAgain") : t("investigate")} ›
        </button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3">
          {disabled && <p className="bee-caption">{t("disabledNote")}</p>}
          {!disabled && budgetExceeded && <p className="bee-caption">{t("budgetExceededNote")}</p>}
          {!brief && !disabled && !research.isPending && <p className="bee-caption py-8 text-center">{t("empty")}</p>}

          {brief && (
            <>
              <p className="text-sm">{brief.summary}</p>
              {Object.keys(brief.findings).length > 0 && (
                <dl className="flex flex-col">
                  {Object.entries(brief.findings).map(([key, value]) => (
                    <div key={key} className="bee-row items-start">
                      <dt className="bee-caption w-32 shrink-0 pt-0.5">{humanizeKey(key)}</dt>
                      <dd className="min-w-0 flex-1 text-sm">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {brief.sources.length > 0 && (
                <p className="bee-micro mt-auto truncate">
                  {t("sources")}: {brief.sources.join(" · ")}
                </p>
              )}
            </>
          )}
          {!brief && !disabled && research.isPending && <p className="bee-caption py-8 text-center">{t("researching")}</p>}
        </div>
      )}
    </OverviewCard>
  );
}
