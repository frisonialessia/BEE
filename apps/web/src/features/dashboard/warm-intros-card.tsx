"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { useWarmIntroSummary } from "@/hooks/queries/use-analytics";
import { useDashboardBase } from "@/lib/demo/mode";

/** "Introducciones cálidas" — a dashboard-wide aggregate no CRM offers:
 *  how many of the org's current hot accounts already have a real warm
 *  path through the CEO's own network (NetworkNavigator), not a cold
 *  outreach guess. See network.py's `get_warm_intro_summary` — this is a
 *  handful of real path lookups over the hottest accounts, capped, never
 *  one per hot account BEE has ever scored. */
export function WarmIntrosCard() {
  const t = useTranslations("dashboardOverview.overview.sections.warmIntros");
  const base = useDashboardBase();
  const { data, isLoading } = useWarmIntroSummary();
  const summary = data?.data ?? null;

  if (isLoading) return <Skeleton className="h-full min-h-[8rem]" />;

  if (!summary || summary.accounts_checked === 0) {
    return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  }

  if (summary.accounts_with_paths === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="bee-caption">{t("noConnections")}</p>
        <Link href={`${base}/network`} className="bee-btn-text !text-xs">
          {t("link")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-sm font-semibold leading-snug">
        {t("checked", { withPaths: summary.accounts_with_paths, checked: summary.accounts_checked })}
      </p>
      <div className="flex-1 space-y-2 overflow-hidden">
        {summary.examples.map((ex) => (
          <div key={ex.domain} className="bee-row gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{ex.company_name}</p>
              <p className="bee-caption truncate">{t("via", { connector: ex.best_path.connector_name ?? "—" })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
