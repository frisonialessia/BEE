"use client";

import { useLocale, useTranslations } from "next-intl";

import { mix } from "@/components/charts/palette";
import { CardTiles, formatDays, formatPct, signalHue, type CardTile } from "@/components/strategy/strategy-card";
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

function WhatWorksCard({ item }: { item: WhatWorksItem }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("signalsStrategies.strategies");
  const { pattern, insight } = item;
  const signalType = pattern?.signal_type ?? insight?.signal_type ?? null;
  const hue = signalHue(signalType);
  const signalLabels: Record<string, string> = getSignalTypeLabels(locale);
  const signalLabel = signalType ? (signalLabels[signalType] ?? signalType) : t("works.anySignal");

  const title = pattern
    ? t("works.viaChannel", { playbook: formatPlaybook(pattern.playbook, locale), channel: formatChannel(pattern.channel, locale) })
    : insight?.title ?? "";

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

  const tiles: CardTile[] = [
    {
      label: t("card.tiles.winRate"),
      value: formatPct(pattern?.win_rate ?? null),
      sub: pattern ? t("card.tiles.sample", { count: pattern.sample_size }) : t("card.tiles.noSample"),
    },
    {
      label: t("card.tiles.days"),
      value: formatDays(pattern?.avg_days_to_close ?? null),
      sub: pattern?.avg_days_to_close != null ? t("works.daysSub") : t("card.tiles.noSample"),
    },
    {
      label: t("works.tiles.market"),
      value: insight ? String(insight.evidence_count) : "—",
      sub: insight ? t("works.confidencePct", { pct: Math.round(insight.confidence * 100) }) : t("works.noInsight"),
    },
  ];

  const confidence = pattern ? t(`works.confidence.${pattern.confidence}`) : null;

  return (
    <article className="bee-bento bee-bento-pad flex h-full flex-col gap-3" style={{ borderColor: mix(hue, 55, "var(--bee-card-border)") }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="bee-card-title !mb-0 truncate" title={title}>{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: mix(hue, 20) }}>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: hue }} />
              <span className="truncate">{signalLabel}</span>
            </span>
            {insight?.industry && <span className="bee-micro truncate">{insight.industry}</span>}
          </div>
        </div>
        {confidence && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--color-text)]" style={{ background: mix(hue, 32) }}>
            {confidence}
          </span>
        )}
      </header>

      <p className="line-clamp-2 text-sm leading-snug" title={evidenceLine}>{evidenceLine}</p>

      <CardTiles tiles={tiles} hue={hue} />

      {/* The market signal behind the pattern: what TrendAnalyst sees across
          the whole feed, and what it implies tactically. */}
      <div className="mt-auto min-w-0 border-l-2 pl-3" style={{ borderColor: hue }}>
        {insight ? (
          <>
            <p className="truncate text-xs font-medium" title={insight.title}>{insight.title}</p>
            <p className="line-clamp-2 bee-micro" title={insight.tactical_implication ?? insight.description}>
              {insight.tactical_implication ?? insight.description}
            </p>
          </>
        ) : (
          <p className="bee-micro">{t("works.noInsightFor", { signal: signalLabel })}</p>
        )}
      </div>
    </article>
  );
}

/** "Qué funciona" — one card per pattern, carrying the market signal behind
 *  it and the evidence it rests on. Replaces the two former tabs
 *  (Aprendizaje: patterns as rows; Mercado: insights as rows) that showed
 *  the two halves of the same answer on separate screens. */
export function WhatWorksList({ items }: { items: WhatWorksItem[] }) {
  const t = useTranslations("signalsStrategies.strategies");

  if (items.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("works.emptyTitle")}</p>
        <p className="bee-caption mt-1">{t("works.emptySubtitle")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [grid-auto-rows:1fr]">
      {items.map((item) => (
        <WhatWorksCard key={item.key} item={item} />
      ))}
    </div>
  );
}
