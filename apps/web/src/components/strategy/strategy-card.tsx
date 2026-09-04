"use client";

import { CalendarPlus, Flame, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { DATA, mix } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { formatChannel, formatNextBestAction, formatPlaybook, getSignalTypeLabels, getUrgencyLabels } from "@/lib/format";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { StrategyEvidence } from "@/lib/strategy-evidence";
import type { Battlecard } from "@/lib/types";

/** One hue per card, picked by the kind of signal that opened the deal so
 *  two funding rounds side by side read as the same family. Anything the
 *  map doesn't know wears lavender. No greens: nothing here is won yet. */
const SIGNAL_HUE: Record<string, string> = {
  funding_round: DATA.honey,
  funding_grant: DATA.honey,
  hiring: DATA.honey,
  leadership_change: DATA.indigo,
  merger_acquisition: DATA.indigo,
  public_tender: DATA.indigo,
  regulatory_change: DATA.indigo,
  tech_adoption: DATA.violet,
  product_launch: DATA.violet,
  news_mention: DATA.violet,
  expansion: DATA.magenta,
  franchise_expansion: DATA.magenta,
  engagement: DATA.magenta,
};

/** The hue a strategy card wears for a given signal type — shared with the
 *  "Qué funciona" cards so a pattern and the battlecards it backs match. */
export function signalHue(signalType: string | null | undefined): string {
  return (signalType && SIGNAL_HUE[signalType]) ?? DATA.lavender;
}

export function formatDays(days: number | null): string {
  return days === null ? "—" : String(Math.round(days));
}

export function formatPct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export interface CardTile {
  label: string;
  value: string;
  sub: string;
}

/** The three-tile row every strategy-family card carries: label, number,
 *  one-line qualifier, all in the card's hue at a pale strength. */
export function CardTiles({ tiles, hue }: { tiles: CardTile[]; hue: string }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="min-w-0 rounded-[var(--radius-md)] px-2.5 py-2" style={{ background: mix(hue, 10) }}>
          <dt className="bee-micro truncate">{tile.label}</dt>
          <dd className="text-sm font-bold tabular-nums">{tile.value}</dd>
          <dd className="bee-micro truncate">{tile.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Battlecard, compact: who · what signal · score; ONE evidence line with the
 * numbers behind the recommendation and where they come from; three stat
 * tiles; the next step; one button that does it. The pain point, closing
 * argument and timing paragraphs live in the drawer's Estrategia tab — the
 * card is for deciding in three seconds, the drawer is for reading.
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
  const { strategy, company, lead, signal } = card;
  const hue = signalHue(signal.signal_type);
  const signalLabels: Record<string, string> = getSignalTypeLabels(locale);
  const signalLabel = signalLabels[signal.signal_type] ?? signal.signal_type;
  const urgency = getUrgencyLabels(locale)[strategy.timing_window.urgency];
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
        return t("evidence.typeIndustry", {
          signal: signalLabel,
          industry: evidence.industry ?? "",
          won: evidence.won,
          total: evidence.sampleSize,
          days,
        });
      case "type":
        return t("evidence.type", { signal: signalLabel, won: evidence.won, total: evidence.sampleSize, days });
      default:
        return card.hot_lead
          ? t("evidence.noneHot", { signal: signalLabel, score, time: detected })
          : t("evidence.none", { signal: signalLabel, score, time: detected });
    }
  })();

  const nextStep = lead.full_name
    ? t("nextStepLead", {
        action: formatNextBestAction(strategy.next_best_action, locale),
        lead: lead.full_name,
        channel: formatChannel(strategy.channel, locale),
      })
    : t("nextStep", {
        action: formatNextBestAction(strategy.next_best_action, locale),
        channel: formatChannel(strategy.channel, locale),
      });

  const tiles: CardTile[] = [
    { label: t("tiles.score"), value: String(score), sub: urgency },
    {
      label: t("tiles.winRate"),
      value: formatPct(evidence.winRate),
      sub: evidence.sampleSize > 0 ? t("tiles.sample", { count: evidence.sampleSize }) : t("tiles.noSample"),
    },
    {
      label: t("tiles.days"),
      value: formatDays(evidence.daysToClose),
      sub: evidence.daysToClose === null ? t("tiles.noSample") : t("tiles.daysSub"),
    },
  ];

  return (
    <article
      className="bee-bento bee-bento-pad flex h-full flex-col gap-3"
      style={{ borderColor: mix(hue, 55, "var(--bee-card-border)") }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="bee-card-title !mb-0 truncate">{company.name ?? card.title}</h3>
            {card.hot_lead && <Flame className="size-3.5 shrink-0 text-[var(--color-text)]" aria-label={t("hotLead")} />}
            {card.manual_review_required && (
              <TriangleAlert className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-label={t("reviewRequired")} />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: mix(hue, 20) }}
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: hue }} />
              <span className="truncate">{signalLabel}</span>
            </span>
            {company.industry && <span className="bee-micro truncate">{company.industry}</span>}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums text-[var(--color-text)]"
          style={{ background: mix(hue, 32) }}
          title={t("scoreTitle")}
        >
          {score}
        </span>
      </header>

      <p className="line-clamp-2 text-sm leading-snug" title={evidenceLine}>
        {evidenceLine}
      </p>

      <CardTiles tiles={tiles} hue={hue} />

      <p className="mt-auto truncate text-xs" title={nextStep}>
        <span className="font-medium">{t("nextStepLabel")}</span> {nextStep}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(card.opportunity_id)}
          className="bee-btn bee-btn--primary min-w-0 flex-1 text-xs"
          title={t("openStrategyTitle")}
        >
          <span className="truncate">{formatNextBestAction(strategy.next_best_action, locale)}</span>
        </button>
        <Link href={calendarHref} className="bee-btn-ghost bee-btn--icon" title={t("scheduleMeeting")} aria-label={t("scheduleMeeting")}>
          <CalendarPlus className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
