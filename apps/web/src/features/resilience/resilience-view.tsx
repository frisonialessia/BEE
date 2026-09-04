"use client";

import { useTranslations } from "next-intl";

import { DATA } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { PendingActionsPanel } from "@/components/pending-actions";
import { AuditLogPanel, FailedEventsPanel } from "@/components/resilience-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendingActions } from "@/hooks/queries/use-pending-actions";
import { useAuditSummary, useDlqSummary } from "@/hooks/queries/use-resilience";

/**
 * Resiliencia — "what needs a human?". A 4-tile strip (things waiting for
 * an OK, failures BEE will retry, failures it gave up on, decisions flagged
 * for review), then the two queues side by side on the .bee-overview grid,
 * and the decision log below as a collapsed secondary view. The strip
 * shares its queries with the boxes (TanStack dedupes), so approving or
 * retrying in a box refreshes the tile too.
 *
 * `showHeader=false` when embedded as a tab of the merged Control page
 * (see control-page.tsx / probar/control/page.tsx). */
export function ResilienceView({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("probarForecastOps.resilience");
  const tNav = useTranslations("nav.items");
  const { data: pending, isLoading: pendingLoading } = usePendingActions(20);
  const { data: dlq, isLoading: dlqLoading } = useDlqSummary();
  const { data: audit, isLoading: auditLoading } = useAuditSummary();

  const awaiting = (pending?.data ?? []).filter((a) => a.status === "pending_approval").length;
  const dlqSummary = dlq?.data ?? null;
  const retrying = dlqSummary ? dlqSummary.pending_count + dlqSummary.retrying_count : 0;
  const gaveUp = dlqSummary?.permanently_failed_count ?? 0;
  const toReview = audit?.data?.manual_review_count ?? 0;
  const loading = pendingLoading || dlqLoading || auditLoading;

  return (
    <div className="space-y-4">
      {showHeader && (
        <header>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <div className="mt-1">
            <h1 className="bee-display">{tNav("resilience")}</h1>
            <p className="bee-caption mt-1">{t("subtitle")}</p>
          </div>
        </header>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <StatStrip cols={4}>
          <StatTile label={t("stats.awaiting")} value={awaiting} hint={awaiting > 0 ? t("stats.awaitingHintSome") : t("stats.awaitingHintNone")} tone={awaiting > 0 ? DATA.honey : DATA.indigo} />
          <StatTile label={t("stats.retrying")} value={retrying} hint={t("stats.retryingHint")} tone={retrying > 0 ? DATA.honey : DATA.indigo} />
          <StatTile label={t("stats.gaveUp")} value={gaveUp} hint={gaveUp > 0 ? t("stats.gaveUpHintSome") : t("stats.gaveUpHintNone")} tone={gaveUp > 0 ? DATA.magenta : DATA.indigo} />
          <StatTile label={t("stats.toReview")} value={toReview} hint={t("stats.toReviewHint")} tone={toReview > 0 ? DATA.honey : DATA.indigo} />
        </StatStrip>
      )}

      <div className="bee-overview">
        <PendingActionsPanel />
        <FailedEventsPanel />
      </div>

      {/* Secondary sub-view: its own grid with auto rows so the collapsed
          log is one compact line, not an 18rem box with three numbers in it. */}
      <div className="bee-overview" style={{ gridAutoRows: "auto" }}>
        <AuditLogPanel />
      </div>
    </div>
  );
}
