import { Layers, Repeat, Sparkles, TrendingUp, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { InsightType, MarketInsight } from "@/types/extended";

const INSIGHT_ICONS: Record<InsightType, typeof TrendingUp> = {
  volume_spike: TrendingUp,
  sector_momentum: Users,
  emerging_pattern: Sparkles,
  competitive_cluster: Layers,
  seasonal_trend: Repeat,
};

function confidenceVariant(confidence: number): "outline" | "warning" | "success" {
  if (confidence >= 0.75) return "success";
  if (confidence >= 0.5) return "warning";
  return "outline";
}

/** TrendAnalyst's aggregate view over the whole signal feed — the "what is
 *  the market telling us collectively" layer that already sharpens every
 *  battlecard behind the scenes (StrategyGeneratorService's market_insights
 *  context) but, until this component existed, was invisible to the CEO. */
export function MarketInsightsList({ insights }: { insights: MarketInsight[] }) {
  const t = useTranslations("sharedB.marketInsights");

  if (insights.length === 0) {
    return (
      <div className="bee-bento bee-bento-pad py-12 text-center">
        <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
        <p className="bee-caption mt-1">{t("emptySubtitle")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {insights.map((insight) => {
        const Icon = INSIGHT_ICONS[insight.insight_type] ?? TrendingUp;
        return (
          <div key={insight.id} className="bee-bento bee-bento-pad">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                  <Icon className="size-4 stroke-[1.5] text-[var(--color-chart-4)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{insight.title}</p>
                  <p className="bee-caption mt-1">{insight.description}</p>
                </div>
              </div>
              <Badge variant={confidenceVariant(insight.confidence)} className="shrink-0">
                {t("confidencePct", { pct: Math.round(insight.confidence * 100) })}
              </Badge>
            </div>

            {insight.tactical_implication && (
              <p className="bee-caption mt-3 border-l-2 border-[var(--color-chart-4)] pl-3 italic">
                {insight.tactical_implication}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {insight.industry && <Badge variant="outline">{insight.industry}</Badge>}
              {insight.signal_type && <Badge variant="outline">{insight.signal_type}</Badge>}
              <span>{t("evidenceCount", { count: insight.evidence_count })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
