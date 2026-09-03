"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("sharedB.opportunityDetail");
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: battlecardResult, isLoading: loadingBattlecard } = useBattlecard(id);
  const { data: artifactsResult, isLoading: loadingArtifacts } = useArtifacts(id);
  const { data: oppsResult } = useOpportunities(undefined, 200);

  const opportunity = oppsResult?.data.find((o) => o.id === id);
  const battlecard = battlecardResult?.data;
  const artifacts = artifactsResult?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/strategies">
            <ArrowLeft className="mr-1 size-4" />
            {t("backToStrategies")}
          </Link>
        </Button>
        {battlecardResult?.live === false && (
          <Badge variant="warning">{t("demoData")}</Badge>
        )}
      </div>

      {opportunity && <OpportunityCard opportunity={opportunity} />}

      {loadingBattlecard ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : battlecard ? (
        <Card>
          <CardContent className="p-4">
            <BattlecardView card={battlecard} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("battlecardUnavailable")}
        </p>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("executionArtifacts")}</h2>
        {loadingArtifacts ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : artifacts ? (
          <ExecutionArtifacts bundle={artifacts} opportunityId={id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("artifactsUnavailable")}
          </p>
        )}
      </section>
    </div>
  );
}
