"use client";

import { ArrowUpRight, Target } from "lucide-react";
import { useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/locales";
import { formatChannel, formatNextBestAction, formatPlaybook, getOpportunityStatusLabels, getOpportunityTypeLabels, opportunityTypeVariant, scoreVariant, stripOpportunityTitlePrefix } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** Oportunidad accionable: lead + señal + estrategia recomendada. */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const locale = useLocale() as Locale;
  const { strategy } = opportunity;
  const opportunityStatusLabels = getOpportunityStatusLabels(locale);
  const opportunityTypeLabels = getOpportunityTypeLabels(locale);
  const opportunityType = opportunity.opportunity_type ?? "new_logo";

  return (
    <article className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center border border-border bg-background">
            <Target className="size-3.5 stroke-[1.25]" />
          </div>
          <Badge variant="secondary">
            {opportunityStatusLabels[opportunity.status]}
          </Badge>
          {opportunityType !== "new_logo" && (
            <Badge variant={opportunityTypeVariant(opportunityType)}>
              {opportunityTypeLabels[opportunityType]}
            </Badge>
          )}
        </div>
        <Badge variant={scoreVariant(opportunity.score)}>
          {Math.round(opportunity.score)}
        </Badge>
      </div>

      <h3 className="mt-3 text-sm font-semibold leading-snug">
        {stripOpportunityTitlePrefix(opportunity.title)}
      </h3>

      {strategy?.rationale && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {strategy.rationale}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {strategy?.next_best_action && (
          <span className="inline-flex items-center gap-1 border border-border bg-primary px-2 py-1 font-medium">
            <ArrowUpRight className="size-3 stroke-[1.25]" />
            {formatNextBestAction(strategy.next_best_action, locale)}
          </span>
        )}
        {strategy?.channel && (
          <span className="border border-border bg-background px-2 py-1 text-muted-foreground">
            {formatChannel(strategy.channel, locale)}
          </span>
        )}
        {strategy?.playbook && (
          <span className="border border-border bg-background px-2 py-1 text-muted-foreground">
            {formatPlaybook(strategy.playbook, locale)}
          </span>
        )}
      </div>
    </article>
  );
}
