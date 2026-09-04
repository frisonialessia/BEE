"use client";

import { AlertCircle, Clock, Zap, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { CyclePredictionPanel } from "@/components/cycle-prediction-panel";
import { DiscRadar } from "@/components/disc-radar";
import { ExecutionArtifacts } from "@/components/execution-artifacts";
import { WhyThisStrategyPanel } from "@/components/strategy/why-this-strategy-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useArtifacts, useBattlecard } from "@/hooks/queries/use-artifacts";
import { useApproveAction, usePendingActions } from "@/hooks/queries/use-pending-actions";
import { useLeadDiscProfile } from "@/hooks/queries/use-psychographic";
import type { Locale } from "@/i18n/locales";
import { formatChannel, formatGenerator, formatNextBestAction, formatPlaybook, getUrgencyLabels } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";
import type { Opportunity } from "@/types/domain";

import { DATA } from "@/components/charts/palette";

import { Chip } from "./primitives";

function Tile({ icon: Icon, label, meta, body, hue }: { icon: LucideIcon; label: string; meta?: string; body: string; hue: string }) {
  const t = useTranslations("crm.drawer.strategy");
  const [more, setMore] = useState(false);
  const long = body.length > 160;
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 stroke-[1.5]" style={{ color: hue }} />
        <p className="bee-caption font-medium">{label}</p>
        {meta && <span className="bee-caption ml-auto font-medium text-[var(--color-text)]">{meta}</span>}
      </div>
      <p className={cn("text-sm leading-snug", !more && "line-clamp-4")}>{body}</p>
      {long && (
        <button type="button" onClick={() => setMore((v) => !v)} className="self-start text-sm font-medium text-[var(--color-text)] underline-offset-2 hover:underline">
          {more ? t("less") : t("more")}
        </button>
      )}
    </div>
  );
}

function Fold({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-t border-[var(--color-divider)] pt-3" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-sm text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/**
 * Estrategia — the battlecard as three compact tiles (pain point · closing
 * argument · timing window) and one row of chips (action · channel ·
 * playbook · generator). Everything longer — why this strategy, cycle
 * prediction, DISC, execution artifacts — stays one fold away, so the tab
 * opens quiet.
 */
export function StrategyTab({ opportunity, hue, expandArtifacts }: { opportunity: Opportunity; hue: string; expandArtifacts: boolean }) {
  const t = useTranslations("crm.drawer");
  const tCard = useTranslations("shared.battlecard.sections");
  const locale = useLocale() as Locale;
  const { data: battlecardResult, isLoading } = useBattlecard(opportunity.id);
  const { data: artifactsResult, isLoading: loadingArtifacts } = useArtifacts(opportunity.id);
  const { data: discResult, isLoading: loadingDisc } = useLeadDiscProfile(opportunity.lead_id ?? undefined);
  // The prepared message's single action. When the orchestrator has queued
  // an outreach for this deal, approving it IS sending it (the backend
  // executes on approval) — so the primary reads "Aprobar y enviar". With
  // nothing queued, the draft's own Copy button in the artifacts fold is
  // the one action; nothing is invented on top of it.
  const { user } = useAuth();
  const { data: pendingResult } = usePendingActions(50);
  const approve = useApproveAction();
  const pending = (pendingResult?.data ?? []).find((a) => a.opportunity_id === opportunity.id && a.status === "pending_approval") ?? null;
  const card = battlecardResult?.data;
  const disc = discResult?.data;
  const urgencyLabels = getUrgencyLabels(locale);
  const DISC_LABELS: Record<string, string> = {
    D: t("disc.labels.D"),
    I: t("disc.labels.I"),
    S: t("disc.labels.S"),
    C: t("disc.labels.C"),
    UNKNOWN: t("disc.labels.UNKNOWN"),
  };

  if (isLoading) return <Skeleton className="h-48" />;
  if (!card) return <p className="text-sm text-muted-foreground">{t("battlecardUnavailable")}</p>;

  const s = card.strategy;
  return (
    <div className="space-y-4">
      {pending && (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-card)] px-4 py-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="bee-caption">{t("strategy.queued")}</p>
            <p className="truncate text-sm font-medium">{pending.title}</p>
            {pending.preview && <p className="truncate text-sm text-muted-foreground">{pending.preview}</p>}
          </div>
          <button
            type="button"
            disabled={approve.isPending || !user}
            onClick={() =>
              user &&
              approve.mutate(
                { id: pending.id, approvedBy: user.id },
                {
                  onSuccess: () => toast.success(t("strategy.approved")),
                  onError: (err) => toast.error(err instanceof ApiError ? err.message : t("strategy.approveError")),
                },
              )
            }
            className="bee-btn bee-btn--primary shrink-0 !text-sm"
          >
            {approve.isPending ? t("strategy.approving") : t("strategy.approveSend")}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile icon={AlertCircle} label={tCard("painPoint")} body={s.pain_point} hue={hue} />
        <Tile icon={Zap} label={tCard("closingArgument")} meta={formatChannel(s.channel, locale)} body={s.closing_argument} hue={hue} />
        <Tile icon={Clock} label={tCard("timingWindow")} meta={urgencyLabels[s.timing_window.urgency]} body={s.timing_window.reason} hue={hue} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip hue={DATA.lavender}>{formatNextBestAction(s.next_best_action, locale)}</Chip>
        <Chip hue={DATA.lavender}>{formatChannel(s.channel, locale)}</Chip>
        <Chip hue={DATA.lavender}>{formatPlaybook(s.playbook, locale)}</Chip>
        <span className="bee-caption ml-auto">
          {formatGenerator(s.generator, locale)} · {Math.round(s.confidence_score * 100)}%
        </span>
      </div>

      <Fold title={t("strategy.why")}>
        <WhyThisStrategyPanel card={card} opportunityId={opportunity.id} />
      </Fold>
      <Fold title={t("strategy.cycle")}>
        <CyclePredictionPanel key={opportunity.id} opportunityId={opportunity.id} />
      </Fold>
      {opportunity.lead_id && (
        <Fold title={t("disc.title")}>
          {loadingDisc ? (
            <Skeleton className="h-40" />
          ) : disc ? (
            <div className="flex flex-wrap items-center gap-4">
              <DiscRadar d={disc.d_score} i={disc.i_score} s={disc.s_score} c={disc.c_score} className="w-full max-w-[220px]" />
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="bee-caption">{t("disc.dominantStyle")}</dt>
                <dd>{DISC_LABELS[disc.dominant_style] ?? disc.dominant_style}</dd>
                <dt className="bee-caption">{t("disc.preferredTone")}</dt>
                <dd>{disc.preferred_tone}</dd>
                <dt className="bee-caption">{t("disc.messages")}</dt>
                <dd>{disc.preferred_message_length}</dd>
                <dt className="bee-caption">{t("disc.confidence")}</dt>
                <dd className="font-bold tabular-nums">{Math.round(disc.confidence * 100)}%</dd>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("disc.unavailable")}</p>
          )}
        </Fold>
      )}
      <Fold title={t("artifacts.title")} defaultOpen={expandArtifacts}>
        {loadingArtifacts ? (
          <Skeleton className="h-40" />
        ) : artifactsResult?.data ? (
          <ExecutionArtifacts bundle={artifactsResult.data} opportunityId={opportunity.id} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("artifacts.unavailable")}</p>
        )}
      </Fold>
    </div>
  );
}
