"use client";

import { ArrowRight, CheckCircle2, Rocket, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useSequences, useStartSequenceExecution } from "@/hooks/queries/use-sequences";
import type { Locale } from "@/i18n/locales";
import { getSignalTypeLabels } from "@/lib/format";
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
    <div className="bee-bento bee-bento-pad space-y-2.5 transition-colors hover:border-[var(--color-chart-4)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {battlecard.company.name ?? battlecard.lead.full_name ?? t("unnamedAccount")}
          </p>
          <p className="bee-caption mt-0.5">
            {signalLabel} · score {Math.round(battlecard.signal.score)}
          </p>
        </div>
        {battlecard.hot_lead && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-chart-5)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--color-chart-5)]">
            <Zap className="size-2.5" />
            {t("hotBadge")}
          </span>
        )}
      </div>

      <div>
        <p className="bee-eyebrow">
          {t("whyItMatters")}
        </p>
        <p className="mt-0.5 bee-micro leading-relaxed">
          {battlecard.signal.description || battlecard.signal.title}
        </p>
      </div>

      <div>
        <p className="bee-eyebrow">
          {t("recommendedAngle")}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{battlecard.strategy.closing_argument}</p>
        <p className="mt-1 bee-micro">
          {t("viaChannel", { playbook: battlecard.strategy.playbook, channel: battlecard.strategy.channel })}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {triggered ? (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--success)]">
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
                className="bee-btn bee-btn--primary text-xs"
              >
                <Rocket className="size-3.5" />
                {startExecution.isPending ? t("triggering") : t("triggerSequence", { name: matchingSequence.name })}
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
export function CriticalAccountsDigest({
  battlecards,
  today,
}: {
  battlecards: Battlecard[];
  today: Date;
}) {
  const t = useTranslations("dashboardOverview.criticalAccounts");
  const critical = battlecards
    .filter(
      (b) => b.ready_to_action && today.getTime() - new Date(b.signal.detected_at).getTime() <= DAY_MS,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (critical.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Rocket className="size-3.5 text-[var(--color-chart-5)]" />
        <p className="bee-eyebrow">{t("title")}</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {critical.map((b) => (
          <CriticalAccountCard key={b.opportunity_id} battlecard={b} />
        ))}
      </div>
    </section>
  );
}
