"use client";

import { useTranslations } from "next-intl";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntegrations } from "@/hooks/queries/use-integrations";
import { useDlqSummary } from "@/hooks/queries/use-resilience";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import { useSystemHealth } from "@/hooks/queries/use-system-health";

const HOUR_MS = 60 * 60 * 1000;
const HOURS = 24;

/**
 * The four numbers that answer "is BEE healthy right now?" before reading
 * any box: what came in over the last 24 h (honey — it is the market
 * talking), what is waiting in line and what failed (magenta — what wants
 * a person), and how many accounts are connected (indigo). One hue per
 * tile; the same queries the boxes below use, deduped by the query client.
 */
export function SystemStatStrip() {
  const t = useTranslations("probarNetworkBrandControl.control.stats");
  const { data: health, isLoading: healthLoading } = useSystemHealth();
  const { data: dlq } = useDlqSummary();
  const { data: integrations } = useIntegrations();
  // dataUpdatedAt as "now": pure during render and moves with every poll.
  const { data: stream, dataUpdatedAt } = useSignalStream();

  if (healthLoading) {
    return (
      <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  const snapshot = health?.data;
  const now = dataUpdatedAt;
  const hourly = Array.from({ length: HOURS }, () => 0);
  for (const e of stream?.data.events ?? []) {
    if (e.stage !== "webhook") continue;
    const age = now - new Date(e.timestamp).getTime();
    if (age < 0 || age > HOURS * HOUR_MS) continue;
    hourly[Math.min(HOURS - 1, Math.max(0, HOURS - 1 - Math.floor(age / HOUR_MS)))] += 1;
  }
  const signals24h = hourly.reduce((s, v) => s + v, 0);
  const queue = snapshot?.worker.queue_depth ?? 0;
  const processingErrors = snapshot?.worker.error_count ?? 0;
  const summary = dlq?.data ?? null;
  const stuck = summary ? summary.pending_count + summary.retrying_count + summary.permanently_failed_count : 0;
  const accounts = (integrations?.data ?? []).filter((s) => s.scope === "organization");
  const connected = accounts.filter((s) => s.connected).length;

  return (
    <StatStrip cols={4}>
      <StatTile label={t("signals24h")} value={signals24h} hint={t("signals24hHint")} trend={hourly} tone={TONE.market} />
      <StatTile label={t("queue")} value={snapshot ? queue : "—"} hint={t("queueHint")} tone={TONE.urgency} />
      <StatTile
        label={t("errors")}
        value={snapshot ? processingErrors + stuck : "—"}
        hint={processingErrors + stuck > 0 ? t("errorsHint", { processing: processingErrors, stuck }) : t("errorsHintNone")}
        tone={TONE.prepared}
      />
      <StatTile
        label={t("connections")}
        value={accounts.length > 0 ? `${connected}/${accounts.length}` : "—"}
        hint={accounts.length > 0 ? t("connectionsHint", { total: accounts.length }) : t("noConnections")}
        progress={accounts.length > 0 ? connected / accounts.length : undefined}
        tone={TONE.forecast}
      />
    </StatStrip>
  );
}
