"use client";

import { CircleCheck, CircleDashed, Pause, TriangleAlert, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AreaChart } from "@/components/charts/area-chart";
import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { StatusWord, type StatusTone } from "@/components/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import { useSystemHealth } from "@/hooks/queries/use-system-health";
import { localeTags, type Locale } from "@/i18n/locales";
import type { WorkerHealth } from "@/types/control";

const HOUR_MS = 60 * 60 * 1000;
const HOURS = 24;

const WORKER_META: Record<WorkerHealth["state"], { tone: StatusTone; icon: typeof CircleCheck }> = {
  idle: { tone: "ok", icon: CircleCheck },
  busy: { tone: "ok", icon: CircleCheck },
  stopped: { tone: "neutral", icon: Pause },
  error: { tone: "attention", icon: TriangleAlert },
};

function HealthRow({
  label,
  hint,
  tone,
  icon,
  word,
}: {
  label: string;
  hint: string;
  tone: StatusTone;
  icon: typeof CircleCheck;
  word: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate bee-micro">{hint}</p>
      </div>
      <StatusWord tone={tone} icon={icon} label={word} />
    </li>
  );
}

/**
 * Motor de señales — what came into the queue over the last 24 h, hour by
 * hour (the real series the stream carries: one point per received signal),
 * and the state of the three moving parts under it: the connection to the
 * API, the database, and the engine that processes signals, with one meter
 * for how loaded that engine is. The queue/processed/error counters that
 * used to sit here are on the strip above — one place, not two. Polls every
 * 10 s (health) and 8 s (stream).
 */
export function SystemHealth() {
  const t = useTranslations("probarNetworkBrandControl.control.systemHealth");
  const locale = useLocale() as Locale;
  const { data: result, isLoading, isError, dataUpdatedAt } = useSystemHealth();
  const { data: stream, dataUpdatedAt: streamUpdatedAt } = useSignalStream();
  const snapshot = result?.data;

  if (isLoading) {
    return (
      <OverviewCard span={4} title={t("title")} caption={t("caption")}>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </OverviewCard>
    );
  }

  if (isError || !snapshot) {
    return (
      <OverviewCard span={4} title={t("title")} caption={t("caption")}>
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <WifiOff className="size-4" />
          {t("connectionError")}
        </p>
      </OverviewCard>
    );
  }

  // Signals received per hour, oldest → newest, from the stream's own
  // webhook events. `dataUpdatedAt` as "now" keeps the render pure.
  const now = streamUpdatedAt || dataUpdatedAt;
  const hourLabel = new Intl.DateTimeFormat(localeTags[locale], { hour: "numeric" });
  const buckets = Array.from({ length: HOURS }, (_, i) => {
    const start = now - (HOURS - i) * HOUR_MS;
    return { start, label: hourLabel.format(new Date(start + HOUR_MS)), value: 0 };
  });
  for (const e of stream?.data.events ?? []) {
    if (e.stage !== "webhook") continue;
    const age = now - new Date(e.timestamp).getTime();
    if (age < 0 || age > HOURS * HOUR_MS) continue;
    const idx = Math.min(HOURS - 1, Math.max(0, HOURS - 1 - Math.floor(age / HOUR_MS)));
    buckets[idx].value += 1;
  }

  const apiLive = snapshot.connectivity.live;
  const worker = snapshot.worker;
  const workerMeta = worker.running ? WORKER_META[worker.state] : WORKER_META.stopped;
  const load = Math.min(100, Math.max(0, worker.load_pct));
  const updatedLabel = new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <OverviewCard
      span={4}
      title={t("title")}
      caption={t("caption")}
      action={<span className="bee-micro whitespace-nowrap">{t("updated", { time: updatedLabel })}</span>}
    >
      <AreaChart
        points={buckets.map((b) => ({ label: b.label, value: b.value }))}
        color={DATA.indigo}
        minHeight={120}
        highlightLast={false}
        formatValue={(v) => t("perHour", { count: Math.round(v) })}
      />

      <ul className="mt-2 divide-y divide-border">
        <HealthRow
          label={t("rows.api")}
          hint={apiLive ? (snapshot.connectivity.environment ?? t("unknownEnvironment")) : t("rows.apiHintDown")}
          tone={apiLive ? "ok" : "failed"}
          icon={apiLive ? CircleCheck : WifiOff}
          word={apiLive ? t("connected") : t("disconnected")}
        />
        <HealthRow
          label={t("rows.db")}
          hint={t("rows.dbHint")}
          tone={snapshot.connectivity.db_ready ? "ok" : "failed"}
          icon={snapshot.connectivity.db_ready ? CircleCheck : CircleDashed}
          word={snapshot.connectivity.db_ready ? t("dbReady") : t("dbNotReady")}
        />
        <HealthRow
          label={t("rows.worker")}
          hint={t("rows.workerHint")}
          tone={workerMeta.tone}
          icon={workerMeta.icon}
          word={worker.running ? t(`worker.state.${worker.state}`) : t("worker.offValue")}
        />
      </ul>

      {/* One meter, one hue: how much work the engine has piled up. */}
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t("loadLabel")}</p>
            <p className="truncate bee-micro">{t("loadHint")}</p>
          </div>
          <span className="text-sm font-bold tabular-nums">{load}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: mix(DATA.indigo, 16) }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${load}%`, background: DATA.indigo }} />
        </div>
      </div>

      {!apiLive && (
        <p className="mt-3 bee-micro">
          {t("fallbackNoticePrefix")}{" "}
          <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_API_URL</code> {t("fallbackNoticeMiddle")}{" "}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code>
        </p>
      )}
    </OverviewCard>
  );
}
