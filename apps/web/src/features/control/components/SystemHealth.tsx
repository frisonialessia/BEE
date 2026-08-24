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

function KpiCard({
  label,
  value,
  mono,
  warn,
  text,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
  /** This tile holds a status word ("Inactivo", "Con errores"), not a
   *  number — the KPI-sized numeric scale wraps mid-word on tiles this
   *  narrow. Falls back to a smaller, non-tabular size that fits. */
  text?: boolean;
}) {
  return (
    <div className="bee-kpi-card">
      <p className="bee-kpi-card__label">{label}</p>
      <p
        className={cn(
          text ? "text-base font-bold tracking-tight" : "bee-kpi-card__value",
          mono && "font-mono",
          warn && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ProviderRow({ provider }: { provider: ProviderStatus }) {
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
            {provider.configured ? "API configurada" : "Modo simulado"}
            {provider.webhook_configured ? " · Webhook ✓" : " · Sin secreto"}
          </p>
        </div>
      </div>
      {/* shrink-0: sin esto, en la columna angosta de Control (~300px), este
          bloque competía por espacio con el label de la izquierda y el
          conteo de tokens terminaba envolviéndose debajo de la barra de
          progreso — la caja de "APIs externas" se veía rota/apretada. */}
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

function WorkerKpis({ worker }: { worker: WorkerHealth }) {
  const stateLabel = {
    idle: "Inactivo",
    busy: "Procesando",
    stopped: "Detenido",
    error: "Con errores",
  }[worker.state];

  return (
    // grid-cols-2 fijo, no .bee-kpi-strip: esa clase usa auto-fit/minmax que
    // en la columna angosta de Control (~300px) salta entre 1, 2 y 4
    // columnas según el ancho exacto del viewport — mismo componente, layout
    // distinto en cada resolución. Acá siempre son 4 tarjetas en un
    // contenedor angosto, así que fijamos 2×2 para que sea predecible.
    <div className="grid grid-cols-2 gap-3">
      <KpiCard label="Ingesta" value={worker.running ? stateLabel : "Apagado"} text />
      <KpiCard label="Cola" value={String(worker.queue_depth)} mono />
      {/* "Procesados" partía a mitad de palabra en la columna angosta de
          Control (2 columnas × ~140px) — "Hechos" cabe en una sola línea
          sin perder claridad junto al valor. */}
      <KpiCard label="Hechos" value={String(worker.processed_count)} mono />
      <KpiCard
        label="Errores"
        value={String(worker.error_count)}
        mono
        warn={worker.error_count > 0}
      />
    </div>
  );
}

function HealthSkeleton() {
  return (
    <section className="bee-surface h-full p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-24 rounded-2xl" />
    </section>
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
    return <HealthSkeleton />;
  }

  if (isError || !snapshot) {
    return (
      <section className="bee-surface flex h-full items-center p-8">
        <div className="flex items-center gap-2 text-destructive">
          <WifiOff className="size-4" />
          <p className="text-sm">No se pudo conectar con la API de BEE — revisa NEXT_PUBLIC_API_URL</p>
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
    <section className="bee-surface flex h-full flex-col p-5" aria-label="Salud del sistema">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">Inteligencia</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">
            {live ? "Conectado" : "Sin conexión"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {live ? (
              <Wifi className="size-3.5 text-[var(--color-chart-4)]" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            {snapshot.connectivity.environment ?? "entorno desconocido"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="size-3.5" />
            BD {snapshot.connectivity.db_ready ? "lista" : "no disponible"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="size-3.5" />
            Actualizado {updatedLabel}
          </span>
        </div>
      </div>

      <WorkerKpis worker={snapshot.worker} />

      {snapshot.providers.length > 0 && (
        <div className="mt-4 flex-1 overflow-hidden">
          <div className="mb-1 flex items-center gap-2">
            <Radio className="size-3.5 text-[var(--color-text-muted)]" />
            <p className="bee-eyebrow">APIs externas</p>
          </div>
          <div className="max-h-24 overflow-y-auto">
            {snapshot.providers.map((p) => (
              <ProviderRow key={p.name} provider={p} />
            ))}
          </div>
        </div>
      )}

      {!live && (
        <p className="mt-4 text-xs text-muted-foreground">
          Mostrando estado de respaldo — inicia la API o configura{" "}
          <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_API_URL</code> en{" "}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code>
        </p>
      )}
    </section>
  );
}
