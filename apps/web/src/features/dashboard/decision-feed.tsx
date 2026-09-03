"use client";

/**
 * DecisionFeed — the Bandeja de Decisiones, backed by GET /api/v1/priority/today.
 *
 * Distinct from DailyBrief/CriticalAccountsDigest below it on this page:
 * those are computed client-side from data this page already fetched
 * (opportunities, anomalies, sequences). This one is server-ranked —
 * PriorityFeedService fuses DarkFunnel intent score, CyclePredictor's
 * decision-window urgency, and active AnomalyDetector alerts into a single
 * "what to act on today" ranking, so it's the one section on this page
 * that actually tells the rep which card to move, not just what's true
 * about the pipeline right now.
 *
 * Each card's three actions reuse existing endpoints rather than new
 * mutation logic:
 *   Aprobar  → the existing useApproveAction() mutation (only shown when
 *              PriorityFeedService found a PendingAction already waiting)
 *   Ejecutar → opens the opportunity drawer, where artifact generation
 *              (GET /opportunities/{id}/artifacts) already lives
 *   Descartar → useDismissFromFeed(), a thin wrapper over the new
 *              POST /priority/today/{id}/dismiss
 *
 * The explanation is structured: the server sends `reason_code` +
 * `reason_params` (see app.services.priority_feed._explain) and this
 * component renders them through `decisionFeed.reasons.*` in the viewer's
 * locale — the same reason-codes-translated-client-side pattern as
 * PipelineFunnel's stage labels. `headline`/`reasoning` (the server's
 * Spanish rendering) remain the fallback for a card without a code —
 * anomaly cards, whose title is the alert's own — and for older payloads.
 */

import { CheckCircle2, PlayCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useDismissFromFeed, useTodayFeed } from "@/hooks/queries/use-priority-feed";
import { useApproveAction } from "@/hooks/queries/use-pending-actions";
import { Skeleton } from "@/components/ui/skeleton";
import type { DecisionCard, DecisionUrgency } from "@/types/extended";
import { useDashboardBase } from "@/lib/demo/mode";

// Tone lives in the contour, not the fill — only signal cards are colored.
const URGENCY_TONE: Record<DecisionUrgency, string> = {
  high: "bee-outline--warm",
  medium: "bee-outline--violet",
  low: "bee-outline--blue",
};

/** Localized explanation: the reason-code template when one exists for
 *  this code, the server's rendered sentence otherwise. */
function useExplanation(card: DecisionCard): { headline: string; reasoning: string } {
  const t = useTranslations("dashboardOverview.decisionFeed");
  const code = card.reason_code;
  if (!code || !t.has(`reasons.${code}.headline`)) {
    return { headline: card.headline, reasoning: card.reasoning };
  }
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(card.reason_params ?? {})) {
    params[key] = value ?? "";
  }
  return {
    headline: t(`reasons.${code}.headline`, params),
    reasoning: t(`reasons.${code}.reasoning`, params),
  };
}

function Card({ card }: { card: DecisionCard }) {
  const t = useTranslations("dashboardOverview.decisionFeed");
  const { headline, reasoning } = useExplanation(card);
  const base = useDashboardBase();
  const { openOpportunity } = useOpportunityDrawer();
  const approveAction = useApproveAction();
  const dismiss = useDismissFromFeed();
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);

  async function handleApprove() {
    if (!card.pending_action_id) return;
    setBusy("approve");
    try {
      await approveAction.mutateAsync({ id: card.pending_action_id, approvedBy: "CEO" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDismiss() {
    if (!card.opportunity_id) return;
    setBusy("dismiss");
    try {
      await dismiss.mutateAsync(card.opportunity_id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`bee-bento flex flex-col gap-2 p-3 ${URGENCY_TONE[card.urgency]}`}>
      <div className="min-w-0">
        <span className="bee-eyebrow">{t(`urgency.${card.urgency}`)}</span>
        <h4 className="mt-1 line-clamp-1 text-sm font-semibold tracking-tight">{headline}</h4>
        <p className="bee-caption mt-1 line-clamp-1">{reasoning}</p>
      </div>

      {card.kind === "opportunity" && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {card.pending_action_id ? (
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={busy !== null}
              className="bee-btn bee-btn--primary text-xs"
            >
              <CheckCircle2 className="size-3.5" />
              {busy === "approve" ? t("approving") : t("approve")}
            </button>
          ) : (
            card.opportunity_id && (
              <button
                type="button"
                onClick={() => openOpportunity(card.opportunity_id!)}
                className="bee-btn bee-btn--primary text-xs"
              >
                <PlayCircle className="size-3.5" />
                {t("execute")}
              </button>
            )
          )}
          {card.opportunity_id && (
            <button
              type="button"
              onClick={() => void handleDismiss()}
              disabled={busy !== null}
              className="bee-btn-ghost text-xs"
            >
              <X className="size-3.5" />
              {busy === "dismiss" ? t("dismissing") : t("dismiss")}
            </button>
          )}
        </div>
      )}

      {card.kind === "anomaly" && (
        <div className="mt-auto pt-1">
          <Link href={`${base}/control?tab=resilience`} className="bee-btn-ghost text-xs">
            {t("viewAlerts")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** `embedded`: rendered inside an OverviewCard (which owns the title), as a
 *  vertical stack of up to three cards that fills the box. */
export function DecisionFeed({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("dashboardOverview.decisionFeed");
  const { data, isLoading } = useTodayFeed();
  const cards = data?.data.cards ?? [];

  if (isLoading) {
    return (
      <div className={embedded ? "grid gap-2" : "mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={embedded ? "h-20" : "h-32"} />
        ))}
      </div>
    );
  }

  if (embedded) {
    if (cards.length === 0) {
      return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
    }
    return (
      <div className="grid grid-cols-1 content-start gap-2">
        {cards.slice(0, 3).map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
    );
  }

  // Nothing real to say → say nothing, same discipline as DailyBrief below.
  if (cards.length === 0) return null;

  return (
    <section className="mb-4 space-y-3">
      <div>
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <h3 className="bee-card-title">{t("title")}</h3>
        <p className="bee-caption">{t("subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.slice(0, 3).map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
