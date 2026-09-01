"use client";

import { Radio, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import { cn } from "@/lib/utils";
import type { ProviderHealthState, ProviderStatus } from "@/types/control";

const PROVIDER_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  g2: "G2",
  google_search: "Google Search",
  capterra: "Capterra",
  hiring: "Hiring Signals",
};

const HEALTH_DOT: Record<ProviderHealthState, string> = {
  online: "bg-[var(--color-primary)]",
  degraded: "bg-[var(--color-chart-1)]",
  mock: "bg-[var(--color-text-muted)]/40",
  offline: "bg-[var(--color-chart-2)]/70",
};

function StatusDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      aria-hidden
    />
  );
}

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const label = PROVIDER_LABELS[provider.name] ?? provider.name;
  const pct =
    provider.tokens_capacity > 0
      ? Math.round((provider.tokens_remaining / provider.tokens_capacity) * 100)
      : 100;

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot className={HEALTH_DOT[provider.health]} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium tracking-tight">{label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {provider.configured ? t("configured") : t("mockMode")}
            {provider.webhook_configured ? ` · ${t("webhookConfigured")}` : ` · ${t("webhookMissing")}`}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {provider.tokens_remaining}/{provider.tokens_capacity}
        </p>
        <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * ApiStatusPanel — external-provider connectivity (LinkedIn/G2/Google
 * Search/Capterra), split out of SystemHealth into its own bottom-row card
 * (see ControlLayout) so it reads as a peer to Flujo de señales/Anomalías
 * rather than a cramped sub-section bolted onto Inteligencia. Same
 * useSystemHealth() query as SystemHealth — TanStack Query dedupes the
 * concurrent call, this isn't a second network round trip.
 */
export function ApiStatusPanel() {
  const t = useTranslations("probarNetworkBrandControl.control.apiStatus");
  const { data: result, isLoading, isError } = useSystemHealth();
  const snapshot = result?.data;

  if (isLoading) {
    return <Skeleton className="h-full min-h-[200px] rounded-2xl" />;
  }

  if (isError || !snapshot) {
    return (
      <section className="bee-surface flex h-full items-center bee-bento-pad">
        <div className="flex items-center gap-2 text-destructive">
          <WifiOff className="size-4" />
          <p className="text-sm">{t("unavailable")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bee-surface flex h-full flex-col bee-bento-pad" aria-label={t("ariaLabel")}>
      <div className="mb-1 flex items-center gap-2">
        <Radio className="size-3.5 text-[var(--color-text-muted)]" />
        <p className="bee-eyebrow">{t("eyebrow")}</p>
      </div>
      {/* overscroll-contain: this card sits inside the independently
       * scrollable bottom row (see globals.css) — without it, scrolling
       * this list to its edge hands the leftover wheel delta to the row
       * and the whole card jumps. */}
      <div className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
        {snapshot.providers.map((p) => (
          <ProviderRow key={p.name} provider={p} />
        ))}
      </div>
    </section>
  );
}
