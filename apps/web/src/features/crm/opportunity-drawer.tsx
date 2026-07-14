"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { ExecutionArtifacts } from "@/components/execution-artifacts";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useArtifacts, useBattlecard } from "@/hooks/queries/use-artifacts";
import { useOpportunities } from "@/hooks/queries/use-opportunities";

/** CRM detail drawer — opens in-place, no page navigation. */
export function OpportunityDrawer() {
  const { opportunityId, closeOpportunity } = useOpportunityDrawer();

  const { data: battlecardResult, isLoading: loadingBattlecard } = useBattlecard(
    opportunityId ?? "",
  );
  const { data: artifactsResult, isLoading: loadingArtifacts } = useArtifacts(
    opportunityId ?? "",
  );
  const { data: oppsResult } = useOpportunities(undefined, 200);

  const opportunity = oppsResult?.data.find((o) => o.id === opportunityId);
  const battlecard = battlecardResult?.data;
  const artifacts = artifactsResult?.data;
  const open = Boolean(opportunityId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOpportunity();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOpportunity]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="bee-drawer-overlay"
        aria-label="Close detail panel"
        onClick={closeOpportunity}
      />
      <aside
        className="bee-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Opportunity detail"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-6 py-4">
          <div>
            <p className="bee-eyebrow">Opportunity</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-text)]">
              {opportunity?.title.replace(/^Opportunity:\s*/, "") ?? "Loading…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeOpportunity}
            className="rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-primary)] hover:text-[var(--color-text)]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {battlecardResult?.live === false && (
            <Badge variant="warning">Demo data</Badge>
          )}

          {opportunity && <OpportunityCard opportunity={opportunity} />}

          {loadingBattlecard ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : battlecard ? (
            <div className="bee-surface p-5">
              <BattlecardView card={battlecard} />
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              Battlecard not available — opportunity may still be enriching.
            </p>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">Execution Artifacts</h3>
            {loadingArtifacts ? (
              <Skeleton className="h-48 rounded-2xl" />
            ) : artifacts ? (
              <ExecutionArtifacts bundle={artifacts} opportunityId={opportunityId!} />
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                Artifacts will generate on first request via the Executive Agent.
              </p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
