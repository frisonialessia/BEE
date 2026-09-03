"use client";

import { Activity, Database, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("probarNetworkBrandControl.control.systemHealth");
  const stateLabel = {
    idle: t("worker.state.idle"),
    busy: t("worker.state.busy"),
    stopped: t("worker.state.stopped"),
    error: t("worker.state.error"),
  }[worker.state];

  return (
    // grid-cols-2 fijo, no .bee-kpi-strip: esa clase usa auto-fit/minmax que
    // en la columna angosta de Control salta entre 1, 2 y 4 columnas según
    // el ancho exacto del viewport — mismo componente, layout distinto en
    // cada resolución. Acá siempre son 4 tarjetas en un contenedor angosto,
    // así que fijamos 2×2 para que sea predecible.
    <div className="grid grid-cols-2 gap-4">
      <KpiCard label={t("worker.ingestLabel")} value={worker.running ? stateLabel : t("worker.offValue")} text />
      <KpiCard label={t("worker.queueLabel")} value={String(worker.queue_depth)} mono />
      {/* "Procesados" partía a mitad de palabra en la columna angosta de
          Control (2 columnas × ~140px) — "Hechos" cabe en una sola línea
          sin perder claridad junto al valor. */}
      <KpiCard label={t("worker.processedLabel")} value={String(worker.processed_count)} mono />
      <KpiCard
        label={t("worker.errorsLabel")}
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
          <Skeleton key={i} className="h-full rounded-lg" />
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
  const t = useTranslations("probarNetworkBrandControl.control.systemHealth");
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
          <p className="text-sm">{t("connectionError")}</p>
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
    <section className="bee-surface flex h-full flex-col bee-bento-pad" aria-label={t("ariaLabel")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 bee-card-title">
            {live ? t("connected") : t("disconnected")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            {live ? (
              <Wifi className="size-3.5 text-[var(--color-chart-4)]" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            {snapshot.connectivity.environment ?? t("unknownEnvironment")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Database className="size-3.5" />
            {snapshot.connectivity.db_ready ? t("dbReady") : t("dbNotReady")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Activity className="size-3.5" />
            {t("updated", { time: updatedLabel })}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <WorkerKpis worker={snapshot.worker} />
        {/* worker.load_pct was already in the API response and unused here
         * — this card's only content used to be the 2×2 KPI grid above,
         * which left a lot of empty vertical space next to its taller row
         * siblings (Intent Hive, Anomalías). A real, already-available
         * number filling real space, not a filler element. */}
        <div>
          <div className="mb-1 flex items-center justify-between bee-micro">
            <span className="text-muted-foreground">{t("loadLabel")}</span>
            <span className="font-mono font-medium text-foreground">{snapshot.worker.load_pct}%</span>
          </div>
          <div className="bee-bar-track">
            <div
              className={cn("bee-bar", snapshot.worker.load_pct >= 80 ? "bee-bar--2" : "bee-bar--4")}
              style={{ width: `${Math.min(100, Math.max(0, snapshot.worker.load_pct))}%` }}
            />
          </div>
        </div>
      </div>

      {!live && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("fallbackNoticePrefix")}{" "}
          <code className="rounded bg-muted px-1 py-1">NEXT_PUBLIC_API_URL</code> {t("fallbackNoticeMiddle")}{" "}
          <code className="rounded bg-muted px-1 py-1">.env.local</code>
        </p>
      )}
    </section>
  );
}
