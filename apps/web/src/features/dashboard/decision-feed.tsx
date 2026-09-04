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
import { signalFill, signalTone, TONE_CSS_VAR } from "@/lib/brand/colors";
import { getSignalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/locales";
import { useDashboardBase } from "@/lib/demo/mode";

// Tone lives in the contour, not the fill — only signal cards are colored.
// One color per box: every play card wears the same indigo; urgency is the
// eyebrow word (ALTA / MEDIA / BAJA), never a second hue in the same box.
const URGENCY_TONE: Record<DecisionUrgency, string> = {
  high: "bee-outline--blue",
  medium: "bee-outline--blue",
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
    <div className={`bee-bento relative flex items-center gap-3 px-3 py-2.5 pr-9 ${style ? "" : URGENCY_TONE[card.urgency]}`} style={style}>
      {/* X in the corner: dismiss. Small, quiet, never a full button. */}
      {card.kind === "opportunity" && card.opportunity_id && (
        <button
          type="button"
          onClick={() => void handleDismiss()}
          disabled={busy !== null}
          aria-label={t("dismiss")}
          title={t("dismiss")}
          className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--color-primary)]/40 hover:text-foreground disabled:opacity-50"
        >
          <X className="size-3" />
        </button>
      )}

      {/* The text gets the whole row; the action is the same small arrow the
          critical-accounts rows use — a big button here only ate the copy. */}
      <div className="min-w-0 flex-1">
        <p className="bee-micro">{t(`urgency.${card.urgency}`)}</p>
        <h4 className="line-clamp-1 text-sm font-semibold leading-snug tracking-tight">{headline}</h4>
        <p className="bee-micro line-clamp-1">{reasoning}</p>
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
export function DecisionFeed({ embedded = false, criticalAccounts = [] }: { embedded?: boolean; criticalAccounts?: Battlecard[] } = {}) {
  const t = useTranslations("dashboardOverview.decisionFeed");
  const tCritical = useTranslations("dashboardOverview.criticalAccounts");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useTodayFeed();
  const feedCards = data?.data.cards ?? [];
  const signalLabels = getSignalTypeLabels(locale);
  const criticalCards: { card: DecisionCard; style: React.CSSProperties }[] = criticalAccounts
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
      style: { background: signalFill(b.signal.signal_type, b.signal.score), borderColor: TONE_CSS_VAR[signalTone(b.signal.signal_type)] },
    }));
  const approvals = feedCards.filter((c) => c.pending_action_id);
  const rest = feedCards.filter((c) => !c.pending_action_id);
  const rows: { card: DecisionCard; style?: React.CSSProperties }[] = [
    ...approvals.map((card) => ({ card })),
    ...criticalCards,
    ...rest.map((card) => ({ card })),
  ];
  const cards = feedCards;
  // Row = border 2 + py-2.5 (20) + micro (16) + one title line (18) + micro (16) → 72; gap-2 → 8.
  const [listRef, capacity] = useRowCapacity<HTMLDivElement>(72, 8, { min: 4, max: 10 });

  if (isLoading) {
    return (
      <div className={embedded ? "grid gap-2" : "mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={embedded ? "h-20" : "h-32"} />
        ))}
      </div>
    );
  }

  if (embedded) {
    if (rows.length === 0) {
      return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
    }
    return (
      <div ref={listRef} className="bee-fill flex flex-col justify-evenly gap-2 overflow-hidden">
        {rows.slice(0, capacity).map(({ card, style }) => (
          <Card key={card.id} card={card} style={style} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.slice(0, 3).map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
