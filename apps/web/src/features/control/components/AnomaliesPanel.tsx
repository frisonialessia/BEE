"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

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

function AlertRow({ alert }: { alert: AnomalyAlert }) {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");

  return (
    <div className="flex items-start gap-4 py-3">
      <span
        className={cn("mt-1 inline-block size-2 shrink-0 rounded-full", SEVERITY_DOT[alert.severity])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium tracking-tight">{alert.title}</p>
          <span className="shrink-0 bee-micro">
            {t(`severity.${alert.severity}`)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
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
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const { data: result, isLoading } = useOpenAnomalies();
  const alerts = result?.data ?? [];

  if (isLoading) {
    return <Skeleton className="h-full min-h-[200px] rounded-lg" />;
  }

  return (
    // h-full: one of three equal-height siblings in the grid's bottom row
    // (see ControlLayout/globals.css) — the row itself claims the
    // remaining viewport height, and this card stretches to match its
    // Flujo de señales / APIs externas siblings rather than sizing to its
    // own (often much shorter) content.
    <section className="bee-surface flex h-full flex-col bee-bento-pad" aria-label={t("ariaLabel")}>
      <div className="mb-1 flex shrink-0 items-center gap-2">
        <AlertTriangle className="size-3.5 text-[var(--color-text-muted)]" />
        <p className="bee-eyebrow">{t("eyebrow")}</p>
      </div>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          {t("empty")}
        </p>
      ) : (
        // overscroll-contain: this card sits inside the independently
        // scrollable bottom row (see globals.css) — without it, scrolling
        // this list to its edge hands the leftover wheel delta to the row
        // and the whole card jumps.
        <div className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
