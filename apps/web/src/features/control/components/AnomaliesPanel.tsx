"use client";

import { CircleAlert, Info, Lightbulb, OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import type { AnomalyAlert } from "@/lib/api/anomalies";

const SEVERITY_META: Record<AnomalyAlert["severity"], { tone: StatusTone; icon: typeof Info }> = {
  low: { tone: "neutral", icon: Info },
  medium: { tone: "attention", icon: CircleAlert },
  high: { tone: "attention", icon: TriangleAlert },
  critical: { tone: "failed", icon: OctagonAlert },
};

function AlertRow({ alert }: { alert: AnomalyAlert }) {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const meta = SEVERITY_META[alert.severity];

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{alert.title}</p>
        <StatusChip tone={meta.tone} icon={meta.icon} label={t(`severity.${alert.severity}`)} title={t("severityHint")} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
      {alert.recommendation && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <span>
            <span className="font-medium">{t("suggestion")} </span>
            {alert.recommendation}
          </span>
        </p>
      )}
    </li>
  );
}

/**
 * Anomalías de conversión — drops in reply or close rate that fall outside
 * what's normal for this organization (overall, per channel or per sector),
 * detected by AnomalyDetector against its own history. Severity is an icon
 * + word; each alert carries BEE's suggestion in plain words.
 */
export function AnomaliesPanel() {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const { data: result, isLoading } = useOpenAnomalies();
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
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
