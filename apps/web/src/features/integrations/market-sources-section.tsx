"use client";

import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { EmptyLine, RowsSkeleton, StateWord } from "@/features/control/components/primitives";
import { useMarketSources } from "@/hooks/queries/use-market-sources";

/**
 * "Fuentes de mercado" — the senses behind the proactive scan, and whether
 * each is live. Nothing here is configured from the UI (sources are
 * deployment-wide env vars); the point is that a person can see *why*
 * their accounts get press and hiring signals without a key, and what
 * turning on Google would add. One row per source, the state as a dot
 * (lavender when live, page grey when it still needs a key) + word.
 */
export function MarketSourcesSection({ span = 12 }: { span?: 4 | 6 | 8 | 12 } = {}) {
  const t = useTranslations("workspace.integrations.marketSources");
  const { data, isLoading } = useMarketSources();
  const sources = data?.sources ?? [];

  return (
    <OverviewCard span={span} title={t("title")} caption={data?.scan_enabled ? t("subtitleEnabled", { hours: data.interval_hours }) : t("subtitleDisabled")}>
      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : sources.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <ul className="bee-fill flex min-h-0 flex-col justify-around">
          {sources.map((source) => {
            const known = t.has(`sources.${source.name}.label`);
            return (
              <li key={source.name} className="bee-row justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{known ? t(`sources.${source.name}.label`) : source.name}</p>
                  <p className="truncate bee-micro">{known ? t(`sources.${source.name}.description`) : source.requires_credentials ? t("requiresCredentials") : t("keyless")}</p>
                </div>
                <StateWord hue={TONE.calm} level={source.configured ? 100 : "rest"} title={source.requires_credentials ? t("requiresCredentials") : t("keyless")}>
                  {source.configured ? t("live") : t("needsKey")}
                </StateWord>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
