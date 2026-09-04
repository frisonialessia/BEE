"use client";

import { useLocale, useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { StackedBars } from "@/components/charts/stacked-bars";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import { localeTags, type Locale } from "@/i18n/locales";
import type { WorkerHealth } from "@/types/control";

import { EmptyLine, Meter, RowsSkeleton, StateWord, type DotLevel } from "./primitives";

const HOUR_MS = 60 * 60 * 1000;
const HOURS = 24;

/** Services wear lavender: 100 is fine, 45 is degraded, REST is down —
 *  the word next to the dot says which. */
const SERVICE = TONE.calm;

const WORKER_LEVEL: Record<WorkerHealth["state"], DotLevel> = {
  idle: 100,
  busy: 100,
  stopped: "rest",
  error: 45,
};

function ServiceRow({ label, hint, level, word }: { label: string; hint: string; level: DotLevel; word: string }) {
  return (
    <li className="bee-row justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate bee-micro">{hint}</p>
      </div>
      <StateWord hue={SERVICE} level={level}>
        {word}
      </StateWord>
    </li>
  );
}

/**
 * Motor de señales — what came into the queue over the last 24 h, hour by
 * hour (the real series the stream carries: one point per received
 * signal) drawn in honey, and under it the three moving parts as hairline
 * rows: the connection to the API, the database, the engine that
 * processes signals, plus one meter for how loaded that engine is. Polls
 * every 10 s (health) and 8 s (stream).
 */
export function SystemHealth() {
  const t = useTranslations("probarNetworkBrandControl.control.systemHealth");
  const locale = useLocale() as Locale;
  const { data: result, isLoading, isError, dataUpdatedAt } = useSystemHealth();
  const { data: stream, dataUpdatedAt: streamUpdatedAt } = useSignalStream();
  const snapshot = result?.data;

  if (isLoading) {
    return (
      <OverviewCard span={7} title={t("title")} caption={t("caption")}>
        <RowsSkeleton rows={4} />
      </OverviewCard>
    );
  }

  if (isError || !snapshot) {
    return (
      <OverviewCard span={7} title={t("title")} caption={t("caption")}>
        <EmptyLine>{t("connectionError")}</EmptyLine>
      </OverviewCard>
    );
  }

  // Signals received per hour, oldest → newest, from the stream's own
  // webhook events. `dataUpdatedAt` as "now" keeps the render pure.
  const now = streamUpdatedAt || dataUpdatedAt;
  const hourLabel = new Intl.DateTimeFormat(localeTags[locale], { hour: "numeric" });
  const buckets = Array.from({ length: HOURS }, (_, i) => {
    const start = now - (HOURS - i) * HOUR_MS;
    return { label: hourLabel.format(new Date(start + HOUR_MS)), parts: [0], current: i === HOURS - 1 };
  });
  for (const e of stream?.data.events ?? []) {
    if (e.stage !== "webhook") continue;
    const age = now - new Date(e.timestamp).getTime();
    if (age < 0 || age > HOURS * HOUR_MS) continue;
    const idx = Math.min(HOURS - 1, Math.max(0, HOURS - 1 - Math.floor(age / HOUR_MS)));
    buckets[idx].parts[0] += 1;
  }
  const total = buckets.reduce((s, b) => s + b.parts[0], 0);

  const apiLive = snapshot.connectivity.live;
  const worker = snapshot.worker;
  const load = Math.min(100, Math.max(0, worker.load_pct));
  const updatedLabel = new Date(dataUpdatedAt).toLocaleTimeString(localeTags[locale], { hour: "2-digit", minute: "2-digit" });

  return (
    <OverviewCard span={7} title={t("title")} caption={t("caption")} action={<span className="bee-micro whitespace-nowrap">{t("updated", { time: updatedLabel })}</span>}>
      {total === 0 ? (
        <EmptyLine>{t("noSignals")}</EmptyLine>
      ) : (
        <StackedBars points={buckets} legend={[t("legend")]} tone={TONE.market} minHeight={120} showLegend={false} formatValue={(v) => t("perHour", { count: Math.round(v) })} />
      )}

      <ul className="mt-2 shrink-0">
        <ServiceRow
          label={t("rows.api")}
          hint={apiLive ? (snapshot.connectivity.environment ?? t("unknownEnvironment")) : t("rows.apiHintDown")}
          level={apiLive ? 100 : "rest"}
          word={apiLive ? t("connected") : t("disconnected")}
        />
        <ServiceRow label={t("rows.db")} hint={t("rows.dbHint")} level={snapshot.connectivity.db_ready ? 100 : "rest"} word={snapshot.connectivity.db_ready ? t("dbReady") : t("dbNotReady")} />
        <ServiceRow
          label={t("rows.worker")}
          hint={t("rows.workerHint")}
          level={worker.running ? WORKER_LEVEL[worker.state] : "rest"}
          word={worker.running ? t(`worker.state.${worker.state}`) : t("worker.offValue")}
        />
        <li className="bee-row justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t("loadLabel")}</p>
            <p className="truncate bee-micro">{t("loadHint")}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2" title={`${load}%`}>
            <Meter value={load / 100} hue={SERVICE} className="w-24" />
            <span className="bee-caption tabular-nums">{load}%</span>
          </span>
        </li>
      </ul>

      {!apiLive && (
        <p className="mt-2 bee-micro">
          {t("fallbackNoticePrefix")} <code className="rounded bg-[var(--color-background)] px-1 py-0.5">NEXT_PUBLIC_API_URL</code> {t("fallbackNoticeMiddle")}{" "}
          <code className="rounded bg-[var(--color-background)] px-1 py-0.5">.env.local</code>
        </p>
      )}
    </OverviewCard>
  );
}
