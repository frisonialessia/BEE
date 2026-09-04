"use client";

import { ArrowRight, CheckCircle2, Rocket, Star, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useSequences, useStartSequenceExecution } from "@/hooks/queries/use-sequences";
import type { Locale } from "@/i18n/locales";
import { signalFill, signalTone, TONE_CSS_VAR } from "@/lib/brand/colors";
import { formatChannel, formatPlaybook, getSignalTypeLabels } from "@/lib/format";
import type { SignalType } from "@/lib/types";
import type { Battlecard } from "@/types/domain";

const DAY_MS = 86_400_000;

function findMatchingSequence(
  battlecard: Battlecard,
  sequences: { id: string; name: string; signal_type: string | null; status: string }[],
) {
  return sequences.find(
    (s) => s.status === "active" && (s.signal_type === null || s.signal_type === battlecard.signal.signal_type),
  );
}

function CriticalAccountCard({ battlecard }: { battlecard: Battlecard }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.criticalAccounts");
  const { data: seqResult } = useSequences();
  const startExecution = useStartSequenceExecution();
  const { openOpportunity } = useOpportunityDrawer();
  const [triggered, setTriggered] = useState(false);

  const sequences = seqResult?.data ?? [];
  const matchingSequence = findMatchingSequence(battlecard, sequences);
  const signalLabel =
    getSignalTypeLabels(locale)[battlecard.signal.signal_type as SignalType] ??
    battlecard.signal.signal_type;

  async function handleTrigger() {
    if (!matchingSequence) return;
    await startExecution.mutateAsync({
      sequence_id: matchingSequence.id,
      opportunity_id: battlecard.opportunity_id,
    });
    setTriggered(true);
  }

  return (
    // Filled with the signal's own tone (same mapping as SignalCard): a
    // critical account is a signal-driven card, and the fill is what makes
    // it read as important next to the white boxes around it.
    <div
      className="bee-bento bee-bento-pad space-y-3 transition-opacity hover:opacity-90"
      style={{
        background: signalFill(battlecard.signal.signal_type, battlecard.signal.score),
        borderColor: TONE_CSS_VAR[signalTone(battlecard.signal.signal_type)],
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {battlecard.company.name ?? battlecard.lead.full_name ?? t("unnamedAccount")}
          </p>
          <p className="bee-caption mt-1">
            {signalLabel} · score {Math.round(battlecard.signal.score)}
          </p>
        </div>
        {battlecard.hot_lead && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-chart-5)]/20 px-2 py-1 text-micro font-medium text-[var(--color-chart-5)]">
            <Zap className="size-2.5" />
            {t("hotBadge")}
          </span>
        )}
      </div>

      <div>
        <p className="bee-eyebrow">
          {t("whyItMatters")}
        </p>
        <p className="mt-1 bee-micro leading-relaxed">
          {battlecard.signal.description || battlecard.signal.title}
        </p>
      </div>

      <div>
        <p className="bee-eyebrow">
          {t("recommendedAngle")}
        </p>
        <p className="mt-1 line-clamp-2 text-micro leading-relaxed">{battlecard.strategy.closing_argument}</p>
        <p className="mt-1 bee-micro">
          {t("viaChannel", { playbook: formatPlaybook(battlecard.strategy.playbook, locale), channel: formatChannel(battlecard.strategy.channel, locale) })}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {triggered ? (
          <span className="flex items-center gap-2 text-micro text-[var(--success)]">
            <CheckCircle2 className="size-3.5" />
            {t("sequenceStarted")}
          </span>
        ) : (
          <>
            {matchingSequence && (
              <button
                type="button"
                onClick={handleTrigger}
                disabled={startExecution.isPending}
                className="bee-btn bee-btn--primary min-w-0 max-w-full text-xs"
              >
                <Rocket className="size-3.5 shrink-0" />
                <span className="truncate">
                  {startExecution.isPending ? t("triggering") : t("triggerSequence", { name: matchingSequence.name })}
                </span>
              </button>
            )}
            {/* Siempre visible — disparar una secuencia no debe ser la única
                forma de ver el detalle completo de la cuenta. */}
            <button
              type="button"
              onClick={() => openOpportunity(battlecard.opportunity_id)}
              className="bee-btn-ghost text-xs"
            >
              {t("viewBattlecard")}
              <ArrowRight className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** La evolución del Brief del día: no una lista de chips de navegación, sino
 *  el detalle completo de las cuentas más críticas que se movieron hoy —
 *  señal, por qué importa, ángulo recomendado (el battlecard que ya generó
 *  StrategyGeneratorService) y una acción directa para disparar la
 *  automatización correspondiente (DynamicSequenceEngine, Módulo de
 *  Automatizaciones). Sin automatización que calce con el tipo de señal, cae
 *  a "ver battlecard" — nunca un botón que no hace nada. */
/** One compact row per account for the Resumen box: who, which signal and
 *  score, and the same two actions the full card has — the "why it matters /
 *  recommended angle" detail is one click away in the battlecard itself. */
function CriticalAccountRow({ battlecard }: { battlecard: Battlecard }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("dashboardOverview.criticalAccounts");
  const { openOpportunity } = useOpportunityDrawer();
  const signalLabel =
    getSignalTypeLabels(locale)[battlecard.signal.signal_type as SignalType] ??
    battlecard.signal.signal_type;

  return (
    <button
      type="button"
      onClick={() => openOpportunity(battlecard.opportunity_id)}
      className="bee-bento relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-opacity hover:opacity-90"
      style={{
        background: signalFill(battlecard.signal.signal_type, battlecard.signal.score),
        borderColor: TONE_CSS_VAR[signalTone(battlecard.signal.signal_type)],
      }}
    >
      {/* A hot lead is a honey star in the corner — the fill already carries
          the signal's color, so a word would only repeat it. Visual language,
          not more text for the rep to read. */}
      {battlecard.hot_lead && (
        <Star
          aria-label={t("hotBadge")}
          className="absolute right-2 top-2 size-3.5 fill-[var(--color-chart-1)] text-[var(--color-chart-1)]"
        />
      )}
      <div className="min-w-0 flex-1 pr-3">
        <p className="truncate text-xs font-semibold">
          {battlecard.company.name ?? battlecard.lead.full_name ?? t("unnamedAccount")}
        </p>
        <p className="bee-micro truncate">
          {signalLabel} · score {Math.round(battlecard.signal.score)}
        </p>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function CriticalAccountsDigest({
  battlecards,
  today,
  embedded = false,
}: {
  battlecards: Battlecard[];
  today: Date;
  /** Inside an OverviewCard: compact rows, no section header of its own. */
  embedded?: boolean;
}) {
  const t = useTranslations("dashboardOverview.criticalAccounts");
  const critical = battlecards
    .filter(
      (b) => b.ready_to_action && today.getTime() - new Date(b.signal.detected_at).getTime() <= DAY_MS,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (embedded) {
    if (critical.length === 0) {
      return <p className="bee-caption py-8 text-center">{t("empty")}</p>;
    }
    return (
      <div className="bee-fill flex flex-col justify-evenly gap-2">
        {critical.map((b) => (
          <CriticalAccountRow key={b.opportunity_id} battlecard={b} />
        ))}
      </div>
    );
  }

  if (critical.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <Rocket className="size-3.5 text-[var(--color-chart-5)]" />
        <p className="bee-eyebrow">{t("title")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {critical.map((b) => (
          <CriticalAccountCard key={b.opportunity_id} battlecard={b} />
        ))}
      </div>
    </section>
  );
}
