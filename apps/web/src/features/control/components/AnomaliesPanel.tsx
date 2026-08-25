"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import type { AnomalyAlert } from "@/lib/api/anomalies";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<AnomalyAlert["severity"], string> = {
  low: "bg-[var(--color-text-muted)]/40",
  medium: "bg-[var(--color-chart-1)]",
  high: "bg-[var(--color-chart-2)]/80",
  critical: "bg-[var(--color-chart-2)]",
};

const SEVERITY_LABEL: Record<AnomalyAlert["severity"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

function AlertRow({ alert }: { alert: AnomalyAlert }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={cn("mt-1 inline-block size-2 shrink-0 rounded-full", SEVERITY_DOT[alert.severity])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium tracking-tight">{alert.title}</p>
          <span className="shrink-0 bee-micro">
            {SEVERITY_LABEL[alert.severity]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
        <p className="mt-1 text-xs text-[var(--color-chart-4)]">{alert.recommendation}</p>
      </div>
    </div>
  );
}

/**
 * AnomaliesPanel — anomalías de conversión detectadas por AnomalyDetector
 * (caída significativa en tasa de conversión general, por canal o por
 * sector vs. su línea base histórica). Vive en la columna de métricas de
 * Control junto a SystemHealth — es el mismo servicio, orientado a "algo
 * cambió en el pipeline", no a infraestructura.
 */
export function AnomaliesPanel() {
  const { data: result, isLoading } = useOpenAnomalies();
  const alerts = result?.data ?? [];

  if (isLoading) {
    return <Skeleton className="mt-4 h-24 rounded-2xl" />;
  }

  return (
    <section className="bee-surface mt-4 p-5" aria-label="Anomalías de conversión">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-[var(--color-text-muted)]" />
        <p className="bee-eyebrow">Anomalías</p>
      </div>
      {/* overscroll-contain below: same nested-scroll fix as SystemHealth's
       * APIs externas list — this card also sits inside the independently
       * scrollable .bee-crm-control__metrics column. */}
      {alerts.length === 0 ? (
        <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Sin caídas de conversión fuera de lo normal
        </p>
      ) : (
        <div className="max-h-56 divide-y divide-border overflow-y-auto overscroll-contain">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
