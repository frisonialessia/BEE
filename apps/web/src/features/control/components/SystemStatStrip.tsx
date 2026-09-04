"use client";

import { useTranslations } from "next-intl";

import { DATA } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditSummary } from "@/hooks/queries/use-resilience";
import { useSignalStream } from "@/hooks/queries/use-signal-stream";
import { useSystemHealth } from "@/hooks/queries/use-system-health";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The five numbers that answer "is BEE healthy right now?" before reading
 * any box: what came in over the last 24 h (ingest), work waiting in line,
 * processing errors, how confident the agents' decisions have been, and
 * sources actually delivering. Only figures the backend really reports —
 * there is no latency series, so there is no latency tile. Tone follows the
 * status rule — indigo when fine, honey when a number wants attention —
 * never red. Same queries the boxes below use; the query client dedupes
 * them, this is not extra traffic. This strip used to be split between the
 * Sistema and Resiliencia tabs, each repeating the queue and error counts.
 */
export function SystemStatStrip() {
  const t = useTranslations("probarNetworkBrandControl.control.stats");
  const { data: health, isLoading: healthLoading } = useSystemHealth();
  const { data: audit } = useAuditSummary();
  // dataUpdatedAt as "now": pure during render and moves with every poll.
  const { data: stream, dataUpdatedAt } = useSignalStream();

  if (healthLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const snapshot = health?.data;
  const now = dataUpdatedAt;
  const signals24h = (stream?.data.events ?? []).filter(
    (e) => e.stage === "webhook" && now - new Date(e.timestamp).getTime() <= DAY_MS,
  ).length;
  const providers = snapshot?.providers ?? [];
  const active = providers.filter((p) => p.health === "online" || p.health === "degraded").length;
  const queue = snapshot?.worker.queue_depth ?? 0;
  const errors = snapshot?.worker.error_count ?? 0;
  const auditSummary = audit?.data ?? null;
  const confidence = auditSummary && auditSummary.total_entries > 0 ? auditSummary.avg_confidence_score : null;
  const toReview = auditSummary?.manual_review_count ?? 0;

  return (
    <StatStrip cols={5}>
      <StatTile label={t("signals24h")} value={signals24h} hint={t("signals24hHint")} tone={DATA.indigo} />
      <StatTile
        label={t("queue")}
        value={snapshot ? queue : "—"}
        hint={t("queueHint")}
        tone={queue > 5 ? DATA.honey : DATA.indigo}
      />
      <StatTile
        label={t("errors")}
        value={snapshot ? errors : "—"}
        hint={errors > 0 ? t("errorsHintSome") : t("errorsHintNone")}
        tone={errors > 0 ? DATA.honey : DATA.indigo}
      />
      <StatTile
        label={t("modelConfidence")}
        value={confidence === null ? "—" : `${Math.round(confidence * 100)}%`}
        hint={confidence === null ? t("modelConfidenceHintNone") : t("modelConfidenceHint", { count: toReview })}
        progress={confidence ?? undefined}
        tone={toReview > 0 ? DATA.honey : DATA.indigo}
      />
      <StatTile
        label={t("activeSources")}
        value={providers.length > 0 ? `${active}/${providers.length}` : "—"}
        hint={providers.length > 0 ? t("activeSourcesHint", { total: providers.length }) : t("noSources")}
        progress={providers.length > 0 ? active / providers.length : undefined}
        tone={providers.length > 0 && active < providers.length ? DATA.honey : DATA.indigo}
      />
    </StatStrip>
  );
}
