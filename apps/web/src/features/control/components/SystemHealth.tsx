"use client";

import { Activity, Database, Radio, Wifi, WifiOff } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import { cn } from "@/lib/utils";
import type { ProviderHealthState, ProviderStatus, WorkerHealth } from "@/types/control";

const PROVIDER_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  g2: "G2",
  google_search: "Google Search",
  capterra: "Capterra",
};

const HEALTH_DOT: Record<ProviderHealthState, string> = {
  online: "bg-[var(--bee-terracotta)]",
  degraded: "bg-[var(--bee-ochre)]",
  mock: "bg-muted-foreground/40",
  offline: "bg-destructive/70",
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
  const label = PROVIDER_LABELS[provider.name] ?? provider.name;
  const pct =
    provider.tokens_capacity > 0
      ? Math.round((provider.tokens_remaining / provider.tokens_capacity) * 100)
      : 100;

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot className={HEALTH_DOT[provider.health]} />
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-tight">{label}</p>
          <p className="text-xs text-muted-foreground">
            {provider.configured ? "API configured" : "Mock mode"}
            {provider.webhook_configured ? " · Webhook ✓" : " · No webhook secret"}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {provider.tokens_remaining}/{provider.tokens_capacity}
        </p>
        <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--bee-terracotta)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function WorkerStrip({ worker }: { worker: WorkerHealth }) {
  const stateLabel = {
    idle: "Idle",
    busy: "Processing",
    stopped: "Stopped",
    error: "Errors",
  }[worker.state];

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      <Metric label="IngestionWorker" value={worker.running ? stateLabel : "Off"} />
      <Metric label="Queue" value={String(worker.queue_depth)} mono />
      <Metric label="Processed" value={String(worker.processed_count)} mono />
      <Metric label="Errors" value={String(worker.error_count)} mono warn={worker.error_count > 0} />
    </div>
  );
}

function Metric({
  label,
  value,
  mono,
  warn,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-light tracking-tight",
          mono && "font-mono tabular-nums",
          warn && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * SystemHealth — top widget for the BEE control dashboard.
 *
 * Shows API connectivity, IngestionWorker load, and external provider status
 * (LinkedIn / G2 / Google). Polls every 10s via TanStack Query.
 */
export function SystemHealth() {
  const { data: result, isLoading, isError, dataUpdatedAt } = useSystemHealth();
  const snapshot = result?.data;
  const live = result?.live ?? false;

  if (isLoading) {
    return (
      <section className="bee-surface p-8">
        <Skeleton className="mb-6 h-5 w-40" />
        <div className="grid grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <Skeleton className="mt-8 h-24" />
      </section>
    );
  }

  if (isError || !snapshot) {
    return (
      <section className="bee-surface p-8">
        <div className="flex items-center gap-2 text-destructive">
          <WifiOff className="size-4" />
          <p className="text-sm">Unable to reach BEE API — check NEXT_PUBLIC_API_URL</p>
        </div>
      </section>
    );
  }

  const updatedLabel = new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="bee-surface p-8" aria-label="System health">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            System Health
          </h2>
          <p className="mt-1 text-2xl font-light tracking-tight text-foreground">
            {live ? "Connected" : "Offline"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {live ? (
              <Wifi className="size-3.5 text-[var(--bee-terracotta)]" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            {snapshot.connectivity.environment ?? "unknown env"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="size-3.5" />
            DB {snapshot.connectivity.db_ready ? "ready" : "unavailable"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="size-3.5" />
            Updated {updatedLabel}
          </span>
        </div>
      </div>

      {/* Worker */}
      <WorkerStrip worker={snapshot.worker} />

      {/* Providers */}
      {snapshot.providers.length > 0 && (
        <div className="mt-10">
          <div className="mb-2 flex items-center gap-2">
            <Radio className="size-3.5 text-muted-foreground" />
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              External APIs
            </p>
          </div>
          <div className="divide-y divide-border/40">
            {snapshot.providers.map((p) => (
              <ProviderRow key={p.name} provider={p} />
            ))}
          </div>
        </div>
      )}

      {!live && (
        <p className="mt-6 text-xs text-muted-foreground">
          Showing fallback state — start the API or set{" "}
          <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_API_URL</code> in{" "}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code>
        </p>
      )}
    </section>
  );
}
