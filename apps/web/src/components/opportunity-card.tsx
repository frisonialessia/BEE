import { ArrowUpRight, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { opportunityStatusLabels, scoreVariant } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** Oportunidad accionable: lead + señal + estrategia recomendada. */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const { strategy } = opportunity;

  return (
    <article className="bee-bento bee-bento-pad transition-colors hover:border-[var(--color-chart-4)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center border border-border bg-background">
            <Target className="size-3.5 stroke-[1.25]" />
          </div>
          <Badge variant="secondary">
            {opportunityStatusLabels[opportunity.status]}
          </Badge>
        </div>
        <Badge variant={scoreVariant(opportunity.score)}>
          {Math.round(opportunity.score)}
        </Badge>
      </div>

      <h3 className="mt-3 text-sm font-semibold leading-snug">
        {opportunity.title.replace(/^Opportunity:\s*/, "")}
      </h3>

      {strategy?.rationale && (
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
          {strategy.rationale}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {strategy?.next_best_action && (
          <span className="inline-flex items-center gap-1 border border-border bg-primary px-2 py-1 font-medium">
            <ArrowUpRight className="size-3 stroke-[1.25]" />
            {String(strategy.next_best_action).replace(/_/g, " ")}
          </span>
        )}
        {strategy?.channel && (
          <span className="border border-border bg-background px-2 py-1 text-muted-foreground">
            {String(strategy.channel)}
          </span>
        )}
        {strategy?.playbook && (
          <span className="border border-border bg-background px-2 py-1 text-muted-foreground">
            {String(strategy.playbook).replace(/_/g, " ")}
          </span>
        )}
      </div>
    </article>
  );
}
