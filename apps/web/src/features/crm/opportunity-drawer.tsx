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

/** Drawer CRM — detalle in-place sin navegación. */
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
        aria-label="Cerrar panel de detalle"
        onClick={closeOpportunity}
      />
      <aside
        className="bee-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de oportunidad"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p className="bee-eyebrow">Oportunidad</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {opportunity?.title.replace(/^Opportunity:\s*/, "") ?? "Cargando…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeOpportunity}
            className="rounded-sm p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="size-5 stroke-[1.25]" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {battlecardResult?.live === false && (
            <Badge variant="warning">Datos demo</Badge>
          )}

          {opportunity && <OpportunityCard opportunity={opportunity} />}

          {loadingBattlecard ? (
            <Skeleton className="h-64" />
          ) : battlecard ? (
            <div className="bee-surface p-5">
              <BattlecardView card={battlecard} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Battlecard no disponible — la oportunidad puede estar enriqueciéndose.
            </p>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">Artefactos de ejecución</h3>
            {loadingArtifacts ? (
              <Skeleton className="h-48" />
            ) : artifacts ? (
              <ExecutionArtifacts bundle={artifacts} opportunityId={opportunityId!} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Los artefactos se generarán en la primera solicitud vía Executive Agent.
              </p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
