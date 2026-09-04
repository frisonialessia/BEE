"use client";

import { useLocale, useTranslations } from "next-intl";

import { TONE, tint } from "@/components/charts/palette";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import type { Locale } from "@/i18n/locales";
import { formatChannel, formatPlaybook, getSignalTypeLabels } from "@/lib/format";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { StrategyEvidence } from "@/lib/strategy-evidence";
import type { Battlecard } from "@/lib/types";

export function formatPct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * A battlecard as one white box of the grid: the company, the signal that
 * opened the deal as a honey chip, the closing argument, the pain it
 * answers, one evidence line with the numbers behind it, and two quiet
 * actions. The full strategy lives in the drawer's Estrategia tab — the
 * card is for deciding in three seconds.
 */
export function StrategyCard({
  card,
  evidence,
  calendarHref,
  onOpen,
}: {
  card: Battlecard;
  evidence: StrategyEvidence;
  /** Calendar create-meeting flow, prefilled with this opportunity. */
  calendarHref: string;
  onOpen: (opportunityId: string) => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.strategies.card");
  const { strategy, company, signal } = card;
  const signalLabels: Record<string, string> = getSignalTypeLabels(locale);
  const signalLabel = signalLabels[signal.signal_type] ?? signal.signal_type;
  const detected = formatRelativeTime(signal.detected_at, locale);
  const score = Math.round(card.score);

  const evidenceLine = (() => {
    const days = evidence.daysToClose === null ? "" : t("evidence.cycle", { days: Math.round(evidence.daysToClose) });
    switch (evidence.basis) {
      case "pattern":
        return t("evidence.pattern", {
          playbook: formatPlaybook(strategy.playbook, locale),
          channel: formatChannel(strategy.channel, locale),
          signal: signalLabel,
          won: evidence.won,
          total: evidence.sampleSize,
          days,
        });
      case "type_industry":
        return t("evidence.typeIndustry", { signal: signalLabel, industry: evidence.industry ?? "", won: evidence.won, total: evidence.sampleSize, days });
      case "type":
        return t("evidence.type", { signal: signalLabel, won: evidence.won, total: evidence.sampleSize, days });
      default:
        return card.hot_lead ? t("evidence.noneHot", { signal: signalLabel, score, time: detected }) : t("evidence.none", { signal: signalLabel, score, time: detected });
    }
  })();

  const caption = [t("scoreLine", { score }), company.industry, card.hot_lead ? t("hotLead") : null, card.manual_review_required ? t("reviewRequired") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <OverviewCard
      span={4}
      title={company.name ?? card.title}
      caption={caption}
      action={
        <span className="inline-flex max-w-[10rem] items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tint(TONE.market, 45) }}>
          <span className="truncate">{signalLabel}</span>
        </span>
      }
    >
      <p className="line-clamp-3 text-sm" title={strategy.closing_argument}>
        {strategy.closing_argument}
      </p>
      <p className="bee-caption mt-3">{t("painLabel")}</p>
      <p className="line-clamp-2 text-sm" title={strategy.pain_point}>
        {strategy.pain_point}
      </p>
      <p className="bee-caption mt-3 line-clamp-2" title={evidenceLine}>
        {evidenceLine}
      </p>
      <div className="mt-auto flex items-center gap-4 border-t border-[var(--color-divider)] pt-3">
        <CardLink onClick={() => onOpen(card.opportunity_id)}>{t("open")}</CardLink>
        <CardLink href={calendarHref}>{t("schedule")}</CardLink>
      </div>
    </OverviewCard>
  );
}
