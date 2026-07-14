"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBattlecards, useOpportunities } from "@/hooks/queries/use-opportunities";

/** Strategies & battlecards — CEO-ready plays from enriched opportunities. */
export function StrategiesDashboard() {
  const { data: battlecardsResult, isLoading: loadingBattlecards } = useBattlecards();
  const { data: allOppsResult, isLoading: loadingOpps } = useOpportunities(undefined, 100);

  const battlecards = battlecardsResult?.data ?? [];
  const opportunities = allOppsResult?.data ?? [];
  const live = Boolean(battlecardsResult?.live || allOppsResult?.live);
  const loading = loadingBattlecards || loadingOpps;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enriched opportunities with pain point, closing argument, and timing window.
          </p>
        </div>
        <Badge variant={live ? "success" : "warning"}>
          {live ? "Live" : "Demo data"}
        </Badge>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <Tabs defaultValue="battlecards" className="mt-6">
          <TabsList>
            <TabsTrigger value="battlecards">
              Battlecards ({battlecards.length})
            </TabsTrigger>
            <TabsTrigger value="pipeline">
              All opportunities ({opportunities.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="battlecards" className="mt-6">
            {battlecards.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No ready-to-action battlecards yet. Signals must be enriched first.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {battlecards.map((card) => (
                  <Card key={card.opportunity_id} className="group relative">
                    <CardContent className="p-6">
                      <Link
                        href={`/dashboard/opportunities/${card.opportunity_id}`}
                        className="absolute right-4 top-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="View opportunity detail"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                      <BattlecardView card={card} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="mt-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {opportunities.map((opp) => (
                <Link key={opp.id} href={`/dashboard/opportunities/${opp.id}`}>
                  <OpportunityCard opportunity={opp} />
                </Link>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
