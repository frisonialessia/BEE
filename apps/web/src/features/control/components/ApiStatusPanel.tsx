"use client";

import { CircleCheck, CircleDashed, TriangleAlert, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { StatusWord, type StatusTone } from "@/components/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import type { ProviderHealthState, ProviderStatus } from "@/types/control";

const PROVIDER_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  g2: "G2",
  google_search: "Google Search",
  capterra: "Capterra",
  hiring: "Hiring Signals",
};

const HEALTH_META: Record<ProviderHealthState, { tone: StatusTone; icon: typeof CircleCheck }> = {
  online: { tone: "ok", icon: CircleCheck },
  degraded: { tone: "attention", icon: TriangleAlert },
  mock: { tone: "neutral", icon: CircleDashed },
  offline: { tone: "failed", icon: WifiOff },
};

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const label = PROVIDER_LABELS[provider.name] ?? provider.name;
  const meta = HEALTH_META[provider.health];
  const pct =
    provider.tokens_capacity > 0
      ? Math.round((provider.tokens_remaining / provider.tokens_capacity) * 100)
      : 100;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="truncate text-sm font-medium">{label}</p>
          <StatusWord tone={meta.tone} icon={meta.icon} label={t(`health.${provider.health}`)} title={t(`healthHint.${provider.health}`)} />
        </div>
        <p className="mt-0.5 truncate bee-micro">
          {provider.webhook_configured ? t("webhookConfigured") : t("webhookMissing")}
        </p>
      </div>
      {/* Quota meter — one hue for the whole box (indigo), strength says how
          much is left. The words next to it say what the number means. */}
      <div className="w-28 shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums">
          {provider.tokens_remaining}
          <span className="font-normal text-muted-foreground">/{provider.tokens_capacity}</span>
        </p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: mix(DATA.indigo, 16) }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct <= 10 ? mix(DATA.indigo, 55) : DATA.indigo }}
          />
        </div>
        <p className="mt-0.5 bee-micro">{t("quotaLeft")}</p>
      </div>
    </li>
  );
}

/**
 * Fuentes de datos — where signals come from (LinkedIn, G2, Google Search…)
 * and whether each one is delivering. One line per source: name, state as
 * icon + word, whether it pushes events to us on its own, and how much of
 * its hourly quota is left. Same useSystemHealth() query as the rest of the
 * tab (deduped by the query client).
 */
export function ApiStatusPanel() {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const { data: result, isLoading, isError } = useSystemHealth();
  const snapshot = result?.data;

  return (
    <OverviewCard span={6} title={t("title")} caption={t("caption")}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : isError || !snapshot ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <WifiOff className="size-4" />
          {t("unavailable")}
        </p>
      ) : snapshot.providers.length === 0 ? (
        <p className="bee-caption py-8 text-center">{t("empty")}</p>
      ) : (
        <ul className="bee-fill flex max-h-[22rem] flex-col justify-around divide-y divide-border overflow-y-auto overscroll-contain">
          {snapshot.providers.map((p) => (
            <ProviderRow key={p.name} provider={p} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
