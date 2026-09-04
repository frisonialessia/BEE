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

import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useDismissFromFeed, useTodayFeed } from "@/hooks/queries/use-priority-feed";
import { useApproveAction } from "@/hooks/queries/use-pending-actions";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { Skeleton } from "@/components/ui/skeleton";
import type { DecisionCard, DecisionUrgency } from "@/types/extended";
import type { Battlecard } from "@/types/domain";
import { TONE, tint } from "@/components/charts/palette";
import { getSignalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";

// One hue for the whole box — magenta, urgency — and the intensity says
// how urgent: the dot beside each play is the hue at 100 / 70 / 45 %.
const URGENCY_DOT: Record<DecisionUrgency, string> = {
  high: TONE.urgency,
  medium: tint(TONE.urgency, 70),
  low: tint(TONE.urgency, 45),
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

function Card({ card, style }: { card: DecisionCard; style?: React.CSSProperties }) {
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

  const canAct = card.kind === "opportunity" ? Boolean(card.pending_action_id || card.opportunity_id) : true;
  const actionLabel =
    card.kind === "anomaly" ? t("viewAlerts") : card.pending_action_id ? t("approve") : t("execute");

  function handleAct() {
    if (card.kind === "anomaly") return;
    if (card.pending_action_id) void handleApprove();
    else if (card.opportunity_id) openOpportunity(card.opportunity_id);
  }

  return (
    <div className="bee-row relative gap-3 pr-8" style={style}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: URGENCY_DOT[card.urgency] }} aria-hidden />
      {/* X in the corner: dismiss. Small, quiet, never a full button. */}
      {card.kind === "opportunity" && card.opportunity_id && (
        <button
          type="button"
          onClick={() => void handleDismiss()}
          disabled={busy !== null}
          aria-label={t("dismiss")}
          title={t("dismiss")}
          className="absolute right-0 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground disabled:opacity-50"
        >
          <X className="size-3" />
        </button>
      )}

      {/* The text gets the whole row; the action is the same small arrow the
          critical-accounts rows use — a big button here only ate the copy. */}
      <div className="min-w-0 flex-1">
        <h4 className="line-clamp-1 text-sm font-semibold leading-snug tracking-tight">{headline}</h4>
        <p className="bee-caption line-clamp-1">{reasoning}</p>
      </div>

      {card.kind === "anomaly" ? (
        <Link href={`${base}/control?tab=resilience`} aria-label={actionLabel} title={actionLabel} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
          <ArrowRight className="size-3.5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleAct}
          disabled={!canAct || busy !== null}
          aria-label={actionLabel}
          title={busy === "approve" ? t("approving") : actionLabel}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {card.pending_action_id ? <CheckCircle2 className="size-3.5" /> : <ArrowRight className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

/** `embedded`: rendered inside an OverviewCard (which owns the title), as a
 *  vertical stack of up to five compact rows. */
/** `criticalAccounts`: the ready-to-act battlecards that used to have a box of
 *  their own ("Cuentas críticas de hoy"). They answer the same question as
 *  the plays — who do I talk to today — so on Resumen they are merged in as
 *  urgent plays wearing their signal's fill, ahead of everything but a draft
 *  waiting for approval. */
export function DecisionFeed({ criticalAccounts = [] }: { criticalAccounts?: Battlecard[] } = {}) {
  const t = useTranslations("dashboardOverview.decisionFeed");
  const tCritical = useTranslations("dashboardOverview.criticalAccounts");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useTodayFeed();
  const feedCards = data?.data.cards ?? [];
  const signalLabels = getSignalTypeLabels(locale);
  const criticalCards: { card: DecisionCard; style?: React.CSSProperties }[] = criticalAccounts
    .filter((b) => !feedCards.some((c) => c.opportunity_id === b.opportunity_id))
    .map((b) => ({
      card: {
        id: `critical-${b.opportunity_id}`,
        kind: "opportunity",
        company_name: b.company.name ?? null,
        headline: `${b.company.name ?? b.lead.full_name ?? tCritical("unnamedAccount")} · ${signalLabels[b.signal.signal_type as SignalType] ?? b.signal.signal_type}`,
        reasoning: b.signal.description || b.signal.title,
        urgency: "high",
        recommended_action: "call",
        opportunity_id: b.opportunity_id,
        pending_action_id: null,
        score: b.signal.score / 100,
      } as DecisionCard,
      style: undefined,
    }));
  const approvals = feedCards.filter((c) => c.pending_action_id);
  const rest = feedCards.filter((c) => !c.pending_action_id);
  const rows: { card: DecisionCard; style?: React.CSSProperties }[] = [
    ...approvals.map((card) => ({ card })),
    ...criticalCards,
    ...rest.map((card) => ({ card })),
  ];
  // Row = py-2.5 (20) + title line (18) + caption (16) + hairline 1 → 55; no gap.
  const [listRef, capacity] = useRowCapacity<HTMLDivElement>(55, 0, { min: 4, max: 10 });

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
  }
  return (
    <div ref={listRef} className="bee-fill flex flex-col overflow-hidden">
      {rows.slice(0, capacity).map(({ card, style }) => (
        <Card key={card.id} card={card} style={style} />
      ))}
    </div>
  );
}
