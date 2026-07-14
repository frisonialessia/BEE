import { ArrowUpRight, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { opportunityStatusLabels, scoreVariant } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** An actionable opportunity: lead + signal + recommended strategy. */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const { strategy } = opportunity;

  return (
    <Card className="group transition-colors hover:border-primary/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="size-4" />
            </div>
            <Badge variant="secondary">
              {opportunityStatusLabels[opportunity.status]}
            </Badge>
          </div>
          <Badge variant={scoreVariant(opportunity.score)}>
            {Math.round(opportunity.score)}
          </Badge>
        </div>

        <h3 className="mt-3 text-sm font-medium leading-snug">
          {opportunity.title.replace(/^Opportunity:\s*/, "")}
        </h3>

        {strategy?.rationale && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {strategy.rationale}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {strategy?.next_best_action && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
              <ArrowUpRight className="size-3" />
              {String(strategy.next_best_action).replace(/_/g, " ")}
            </span>
          )}
          {strategy?.channel && (
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
              {String(strategy.channel)}
            </span>
          )}
          {strategy?.playbook && (
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
              {String(strategy.playbook).replace(/_/g, " ")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
