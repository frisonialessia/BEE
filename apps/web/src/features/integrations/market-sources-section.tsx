"use client";

import { Newspaper, Radar, Search, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketSources } from "@/hooks/queries/use-market-sources";

const SOURCE_ICONS: Record<string, LucideIcon> = {
  gdelt: Newspaper,
  hiring: UserPlus,
  google_search: Search,
};

/**
 * "Fuentes de mercado" — the senses behind the proactive scan, and whether
 * each is live. Nothing here is configured from the UI (sources are
 * deployment-wide env vars); the point is that a person can see *why*
 * their accounts get press and hiring signals without a key, and what
 * turning on Google would add.
 */
export function MarketSourcesSection() {
  const t = useTranslations("workspace.integrations.marketSources");
  const { data, isLoading } = useMarketSources();

  return (
    <section className="bee-surface bee-bento-pad space-y-4">
      <div className="flex items-start gap-2">
        <Radar className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("title")}</p>
          <p className="bee-caption mt-1">
            {data?.scan_enabled
              ? t("subtitleEnabled", { hours: data.interval_hours })
              : t("subtitleDisabled")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(data?.sources ?? []).map((source) => {
            const Icon = SOURCE_ICONS[source.name] ?? Radar;
            const live = source.configured;
            return (
              <div key={source.name} className="bee-bento flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-muted-foreground" />
                    {t(`sources.${source.name}.label`)}
                  </span>
                  <Badge variant={live ? "success" : "outline"}>{live ? t("live") : t("needsKey")}</Badge>
                </div>
                <p className="bee-caption">{t(`sources.${source.name}.description`)}</p>
                <p className="bee-micro mt-auto text-muted-foreground">
                  {source.requires_credentials ? t("requiresCredentials") : t("keyless")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
