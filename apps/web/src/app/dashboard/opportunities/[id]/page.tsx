"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { ExecutionArtifacts } from "@/components/execution-artifacts";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useArtifacts, useBattlecard } from "@/hooks/queries/use-artifacts";
import { useOpportunities } from "@/hooks/queries/use-opportunities";

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: battlecardResult, isLoading: loadingBattlecard } = useBattlecard(id);
  const { data: artifactsResult, isLoading: loadingArtifacts } = useArtifacts(id);
  const { data: oppsResult } = useOpportunities(undefined, 200);

  const opportunity = oppsResult?.data.find((o) => o.id === id);
  const battlecard = battlecardResult?.data;
  const artifacts = artifactsResult?.data;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/strategies">
            <ArrowLeft className="mr-1 size-4" />
            Back to strategies
          </Link>
        </Button>
        {battlecardResult?.live === false && (
          <Badge variant="warning">Demo data</Badge>
        )}
      </div>

      {opportunity && <OpportunityCard opportunity={opportunity} />}

      {loadingBattlecard ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : battlecard ? (
        <Card>
          <CardContent className="p-6">
            <BattlecardView card={battlecard} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Battlecard not available — opportunity may still be enriching.
        </p>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Execution Artifacts</h2>
        {loadingArtifacts ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : artifacts ? (
          <ExecutionArtifacts bundle={artifacts} opportunityId={id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Artifacts will generate on first request via the Executive Agent.
          </p>
        )}
      </section>
    </div>
  );
}
