"use client";

import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { useAcknowledgeAnomaly, useOpenAnomalies } from "@/hooks/queries/use-anomalies";
import type { AnomalyAlert } from "@/lib/api/anomalies";

import { EmptyLine, RowsSkeleton, StateChip, StateWord, useFittedRows, ViewAllButton, type DotLevel } from "./primitives";

/** Anomalies are urgency: magenta, the most severe the most saturated. */
const HUE = TONE.urgency;
const SEVERITY_LEVEL: Record<AnomalyAlert["severity"], DotLevel> = {
  critical: 100,
  high: 70,
  medium: 45,
  low: "rest",
};

/** Row height contract with useFittedRows. */
const ROW_PX = 57;

/** One alert, one row: what dropped and how much (the number is the why),
 *  what BEE suggests, and "Revisado" to close it. The full description
 *  stays as the row's hover title. */
function AlertRow({ alert, onAcknowledge, busy }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void; busy: boolean }) {
  const t = useTranslations("probarNetworkBrandControl.control.anomalies");
  const deviation = Math.round(alert.deviation_pct);

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap" title={alert.description}>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium leading-snug">{alert.title}</p>
        <p className="truncate bee-micro" title={alert.recommendation}>
          {alert.recommendation}
        </p>
      </div>
      <StateWord hue={HUE} level={SEVERITY_LEVEL[alert.severity]} title={t("severityHint")}>
        {t(`severity.${alert.severity}`)}
      </StateWord>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">
          {deviation > 0 ? "+" : ""}
          {deviation}%
        </span>
        <span className="block bee-micro">{t("rates", { rolling: Math.round(alert.rolling_rate * 100), baseline: Math.round(alert.baseline_rate * 100) })}</span>
      </span>
      <button type="button" onClick={() => onAcknowledge(alert.id)} disabled={busy} className="bee-btn-ghost shrink-0 text-xs" title={t("acknowledgeTitle")}>
        {t("acknowledge")}
      </button>
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
  const [listRef, rows, fit] = useFittedRows(alerts, ROW_PX);

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      className={fit.expanded ? undefined : "lg:h-[22rem]!"}
      action={
        alerts.length > 0 ? (
          <StateChip hue={HUE} level={45}>
            {t("openCount", { count: alerts.length })}
          </StateChip>
        ) : undefined
      }
    >
      {isLoading ? (
        <RowsSkeleton rows={2} />
      ) : alerts.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <>
          <ul ref={listRef} className={fit.expanded ? "bee-fill min-h-0" : "bee-fill min-h-0 overflow-hidden"}>
            {rows.map((alert) => (
              <AlertRow key={alert.id} alert={alert} busy={acknowledge.isPending} onAcknowledge={(id) => acknowledge.mutate(id)} />
            ))}
          </ul>
          <ViewAllButton hidden={fit.hidden} expanded={fit.expanded} onToggle={fit.toggle} />
        </>
      )}
    </OverviewCard>
  );
}
