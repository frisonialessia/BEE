"use client";

import { Search, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
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
 * surfaced on the company detail page. Until this component existed, the
 * backend endpoints (POST .../research, GET .../brief) had zero frontend
 * callers — real research ran and nobody ever saw the output.
 *
 * ACCOUNT_RESEARCH_ENABLED defaults to false in production (see
 * DEPLOY_CHECKLIST.md §3.9) — the `disabled` flag on the research result
 * is handled explicitly here instead of showing a broken/empty state.
 */
export function AccountBriefPanel({ companyId }: { companyId: string }) {
  const t = useTranslations("companiesLeads.companyDetail.accountBrief");
  const locale = useLocale() as Locale;
  const { data: briefResult, isLoading } = useCompanyBrief(companyId);
  const research = useResearchCompany();

  const brief = research.data?.brief ?? briefResult?.data ?? null;
  const disabled = research.data?.disabled ?? false;
  const budgetExceeded = research.data?.budget_exceeded ?? false;

  if (isLoading) {
    return (
      <div className="bee-panel space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="bee-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 bee-card-title">
          <Sparkles className="size-4 text-muted-foreground" />
          {t("heading")}
        </h2>
        <button
          type="button"
          onClick={() => research.mutate({ companyId, force: Boolean(brief) })}
          disabled={research.isPending || disabled}
          className="bee-btn-ghost text-xs"
        >
          <Search className="size-3.5" />
          {research.isPending ? t("researching") : brief ? t("researchAgain") : t("investigate")}
        </button>
      </div>

      {disabled && <p className="bee-caption">{t("disabledNote")}</p>}
      {!disabled && budgetExceeded && <p className="bee-caption">{t("budgetExceededNote")}</p>}

      {!brief && !disabled && !research.isPending && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

      {brief && (
        <div className="space-y-3">
          <p className="text-sm">{brief.summary}</p>

          {Object.keys(brief.findings).length > 0 && (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(brief.findings).map(([key, value]) => (
                <div key={key} className="bee-bento p-3">
                  <dt className="bee-caption font-medium">{humanizeKey(key)}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              {brief.sources.map((source) => (
                <Badge key={source} variant="outline">
                  {source}
                </Badge>
              ))}
            </div>
            <span>{t("generatedAt", { time: formatRelativeTime(brief.created_at, locale) })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
