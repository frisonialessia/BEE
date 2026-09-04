"use client";

import { Check, CircleAlert, Info, OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcknowledgeAnomaly, useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import type { AnomalyAlert } from "@/lib/api/anomalies";

const SEVERITY_META: Record<AnomalyAlert["severity"], { tone: StatusTone; icon: typeof Info }> = {
  low: { tone: "neutral", icon: Info },
  medium: { tone: "attention", icon: CircleAlert },
  high: { tone: "attention", icon: TriangleAlert },
  critical: { tone: "failed", icon: OctagonAlert },
};

/** One alert, two lines, one action: what dropped and how much (the number
 *  is the why), what BEE suggests (one line), and "Revisado" to close it.
 *  The full description stays as the row's hover title. */
function AlertRow({ alert, onAcknowledge, busy }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void; busy: boolean }) {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const meta = SEVERITY_META[alert.severity];
  const deviation = Math.round(alert.deviation_pct);

  return (
    <li className="py-3" title={alert.description}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium leading-snug">{alert.title}</p>
          <StatusChip tone={meta.tone} icon={meta.icon} label={t(`severity.${alert.severity}`)} title={t("severityHint")} />
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums">
            {deviation > 0 ? "+" : ""}
            {deviation}%
          </span>
          <span className="block bee-micro">
            {t("rates", { rolling: Math.round(alert.rolling_rate * 100), baseline: Math.round(alert.baseline_rate * 100) })}
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="bee-caption min-w-0 flex-1 truncate" title={alert.recommendation}>
          {alert.recommendation}
        </p>
        <button
          type="button"
          onClick={() => onAcknowledge(alert.id)}
          disabled={busy}
          className="bee-btn-ghost shrink-0 text-xs"
          title={t("acknowledgeTitle")}
        >
          <Check className="size-3.5" aria-hidden />
          {t("acknowledge")}
        </button>
      </div>
    </li>
  );
}

/**
 * Anomalías de conversión — drops in reply or close rate that fall outside
 * what's normal for this organization (overall, per channel or per sector),
 * detected by AnomalyDetector against its own history. Every row carries the
 * size of the drop as a number, one suggestion line, and the one action a
 * person takes here: mark it reviewed.
 */
export function AnomaliesPanel() {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const { data: result, isLoading } = useOpenAnomalies();
  const acknowledge = useAcknowledgeAnomaly();
  const alerts = result?.data ?? [];

  return (
    <OverviewCard
      span={4}
      title={t("title")}
      caption={t("caption")}
      action={alerts.length > 0 ? <span className="text-sm font-bold tabular-nums">{alerts.length}</span> : undefined}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <ShieldCheck className="size-5 text-[var(--color-chart-4)]" aria-hidden />
          <p className="text-sm">{t("empty")}</p>
          <p className="bee-micro">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto overscroll-contain">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} busy={acknowledge.isPending} onAcknowledge={(id) => acknowledge.mutate(id)} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
