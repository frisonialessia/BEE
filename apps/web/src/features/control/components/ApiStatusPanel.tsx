"use client";

import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import type { ProviderHealthState, ProviderStatus } from "@/types/control";

import { EmptyLine, Meter, RowsSkeleton, StateWord, useFittedRows, ViewAllButton, type DotLevel } from "./primitives";

const PROVIDER_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  g2: "G2",
  google_search: "Google Search",
  capterra: "Capterra",
  hiring: "Hiring Signals",
};

/** Sources are services: lavender at 100 when delivering, 45 when
 *  degraded, REST when simulated or offline — the word says which. */
const HUE = TONE.calm;
const HEALTH_LEVEL: Record<ProviderHealthState, DotLevel> = {
  online: 100,
  degraded: 45,
  mock: "rest",
  offline: "rest",
};

/** Row height contract with useFittedRows: two lines of text + padding. */
const ROW_PX = 57;

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const label = PROVIDER_LABELS[provider.name] ?? provider.name;
  const pct = provider.tokens_capacity > 0 ? provider.tokens_remaining / provider.tokens_capacity : 1;

  return (
    <li className="bee-row justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate bee-micro">{provider.webhook_configured ? t("webhookConfigured") : t("webhookMissing")}</p>
      </div>
      <StateWord hue={HUE} level={HEALTH_LEVEL[provider.health]} title={t(`healthHint.${provider.health}`)}>
        {t(`health.${provider.health}`)}
      </StateWord>
      <span className="hidden w-24 shrink-0 flex-col items-end gap-1 sm:flex" title={`${provider.tokens_remaining}/${provider.tokens_capacity} · ${t("quotaLeft")}`}>
        <Meter value={pct} hue={HUE} className="w-full" />
        <span className="bee-micro tabular-nums">{t("quota", { left: provider.tokens_remaining, total: provider.tokens_capacity })}</span>
      </span>
    </li>
  );
}

/**
 * Fuentes de datos — where signals come from (LinkedIn, G2, Google Search…)
 * and whether each one is delivering. One row per source: name, whether
 * it pushes events to us on its own, its state as a dot + word, and how
 * much of its hourly quota is left. Same useSystemHealth() query as the
 * rest of the board (deduped by the query client).
 */
export function ApiStatusPanel() {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const { data: result, isLoading, isError } = useSystemHealth();
  const providers = result?.data?.providers ?? [];
  const [listRef, rows, fit] = useFittedRows(providers, ROW_PX);

  return (
    <OverviewCard span={5} title={t("title")} caption={t("caption")}>
      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : isError || !result?.data ? (
        <EmptyLine>{t("unavailable")}</EmptyLine>
      ) : providers.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <>
          <ul ref={listRef} className="bee-fill flex min-h-0 flex-col justify-around overflow-hidden">
            {rows.map((p) => (
              <ProviderRow key={p.name} provider={p} />
            ))}
          </ul>
          <ViewAllButton hidden={fit.hidden} expanded={fit.expanded} onToggle={fit.toggle} />
        </>
      )}
    </OverviewCard>
  );
}
