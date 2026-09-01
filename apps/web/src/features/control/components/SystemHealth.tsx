"use client";

import { Activity, Database, Wifi, WifiOff } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import { cn } from "@/lib/utils";
import type { WorkerHealth } from "@/types/control";

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

function WorkerKpis({ worker }: { worker: WorkerHealth }) {
  const stateLabel = {
    idle: "Inactivo",
    busy: "Procesando",
    stopped: "Detenido",
    error: "Con errores",
  }[worker.state];

  return (
    // grid-cols-2 fijo, no .bee-kpi-strip: esa clase usa auto-fit/minmax que
    // en la columna angosta de Control salta entre 1, 2 y 4 columnas según
    // el ancho exacto del viewport — mismo componente, layout distinto en
    // cada resolución. Acá siempre son 4 tarjetas en un contenedor angosto,
    // así que fijamos 2×2 para que sea predecible.
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
    <section className="bee-surface flex h-full flex-col bee-bento-pad">
      <div className="grid flex-1 grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-full rounded-2xl" />
        ))}
      </div>
    </section>
  );
}

/**
 * SystemHealth — API connectivity + IngestionWorker load, one of the
 * Control bento grid's top-row cards (see ControlLayout). Deliberately
 * scoped to just connectivity/worker KPIs now — external-provider status
 * used to live inside this same card but reads as a materially different
 * thing (an operational status widget vs. a per-integration status list)
 * and was making this card disproportionately tall next to its row
 * siblings; see ApiStatusPanel, its own bottom-row card, for that content.
 * Polls every 10s via TanStack Query.
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
      <section className="bee-surface flex h-full items-center bee-bento-pad">
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
    // h-full: this card is now one of three equal-height siblings in the
    // grid's top row (see ControlLayout/globals.css) — every sibling in
    // that row stretches to the row's height by design, unlike the old
    // single-column stack where a stretched card meant a lopsided one.
    <section className="bee-surface flex h-full flex-col bee-bento-pad" aria-label="Salud del sistema">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">Inteligencia</p>
          <h2 className="mt-0.5 bee-card-title">
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

      <div className="flex flex-1 flex-col justify-center">
        <WorkerKpis worker={snapshot.worker} />
      </div>

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
