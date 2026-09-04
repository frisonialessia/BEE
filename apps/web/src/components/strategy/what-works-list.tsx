"use client";

import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";
import type { SuccessPattern } from "@/lib/api/feedback";
import { formatChannel, formatPlaybook, getSignalTypeLabels } from "@/lib/format";
import type { MarketInsight } from "@/types/extended";

/** One "what works" item: a success pattern (the learn step — win rate by
 *  playbook + channel over real closed deals) with the market insight that
 *  backs it (TrendAnalyst's read over the whole signal feed for the same
 *  signal type). An insight with no closed pattern yet is still an item —
 *  the market is saying something the account has not closed on yet. */
export interface WhatWorksItem {
  key: string;
  pattern: SuccessPattern | null;
  insight: MarketInsight | null;
}

/** Pairs every pattern with the strongest active insight for its signal
 *  type, then appends the insights nothing closed on yet. Pure over the two
 *  lists the page already loads — no extra endpoint. */
export function pairPatternsWithInsights(patterns: SuccessPattern[], insights: MarketInsight[]): WhatWorksItem[] {
  const active = insights.filter((i) => i.is_active);
  const bestByType = new Map<string, MarketInsight>();
  for (const insight of active) {
    if (!insight.signal_type) continue;
    const current = bestByType.get(insight.signal_type);
    if (!current || insight.confidence > current.confidence) bestByType.set(insight.signal_type, insight);
  }
  const used = new Set<string>();
  const items: WhatWorksItem[] = patterns.map((p) => {
    const insight = bestByType.get(p.signal_type) ?? null;
    if (insight) used.add(insight.id);
    return { key: `${p.signal_type}-${p.playbook}-${p.channel}-${p.generator}`, pattern: p, insight };
  });
  for (const insight of active) {
    if (!used.has(insight.id)) items.push({ key: `insight-${insight.id}`, pattern: null, insight });
  }
  return items;
}

function WhatWorksRow({ item }: { item: WhatWorksItem }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.strategies");
  const { pattern, insight } = item;
  const signalType = pattern?.signal_type ?? insight?.signal_type ?? null;
  const signalLabels: Record<string, string> = getSignalTypeLabels(locale);
  const signalLabel = signalType ? (signalLabels[signalType] ?? signalType) : t("works.anySignal");

  const title = pattern ? t("works.viaChannel", { playbook: formatPlaybook(pattern.playbook, locale), channel: formatChannel(pattern.channel, locale) }) : (insight?.title ?? "");

  // Same evidence sentence a battlecard quotes, so the two tabs read alike.
  const evidenceLine = pattern
    ? t("card.evidence.pattern", {
        playbook: formatPlaybook(pattern.playbook, locale),
        channel: formatChannel(pattern.channel, locale),
        signal: signalLabel,
        won: Math.round(pattern.win_rate * pattern.sample_size),
        total: pattern.sample_size,
        days: pattern.avg_days_to_close === null ? "" : t("card.evidence.cycle", { days: Math.round(pattern.avg_days_to_close) }),
      })
    : t("works.noPatternYet", { signal: signalLabel });

  const aside = pattern ? t(`works.confidence.${pattern.confidence}`) : insight ? t("works.confidencePct", { pct: Math.round(insight.confidence * 100) }) : null;

  return (
    <li className="bee-row">
      <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
          {title}
        </p>
        {aside && <span className="bee-micro shrink-0 whitespace-nowrap">{aside}</span>}
      </div>
      <p className="bee-caption mt-0.5 line-clamp-1" title={evidenceLine}>
        {evidenceLine}
      </p>
      {/* The market signal behind the pattern: what TrendAnalyst sees across
          the whole feed, and what it implies tactically. */}
      {insight && pattern ? (
        <p className="bee-caption mt-0.5 line-clamp-2" title={insight.tactical_implication ?? insight.description}>
          <span className="font-medium text-[var(--color-text)]">{insight.title}</span> — {insight.tactical_implication ?? insight.description}
        </p>
      ) : insight ? (
        <p className="bee-caption line-clamp-2" title={insight.tactical_implication ?? insight.description}>
          {insight.tactical_implication ?? insight.description}
        </p>
      ) : (
        <p className="bee-micro">{t("works.noInsightFor", { signal: signalLabel })}</p>
      )}
      </div>
    </li>
  );
}

/** "Qué funciona" — one row per pattern, carrying the market signal behind
 *  it and the evidence it rests on: hairline rows, no fills. */
export function WhatWorksList({ items }: { items: WhatWorksItem[] }) {
  const t = useTranslations("signalsStrategies.strategies");

  if (items.length === 0) {
    return <p className="bee-caption">{t("works.emptyTitle")}</p>;
  }

  return (
    <ul className="bee-fill overflow-y-auto">
      {items.map((item) => (
        <WhatWorksRow key={item.key} item={item} />
      ))}
    </ul>
  );
}
