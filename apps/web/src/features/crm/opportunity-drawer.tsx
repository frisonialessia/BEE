"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { BattlecardView } from "@/components/battlecard";
import { CyclePredictionPanel } from "@/components/cycle-prediction-panel";
import { DiscRadar } from "@/components/disc-radar";
import { ExecutionArtifacts } from "@/components/execution-artifacts";
import { QualificationPanel } from "@/components/forecast/qualification-panel";
import { OpportunityCard } from "@/components/opportunity-card";
import { RecordOutcomePanel } from "@/components/outcome/record-outcome-panel";
import { OpportunityTimeline } from "@/components/timeline/opportunity-timeline";
import { TaskListPanel } from "@/components/tasks/task-list-panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useArtifacts, useBattlecard } from "@/hooks/queries/use-artifacts";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useLeadDiscProfile } from "@/hooks/queries/use-psychographic";

const DISC_LABELS: Record<string, string> = {
  D: "Dominante — directo y orientado a resultados",
  I: "Influyente — entusiasta y sociable",
  S: "Estable — paciente y confiable",
  C: "Analítico — preciso y orientado a datos",
  UNKNOWN: "Sin clasificar",
};

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

  const { data: discResult, isLoading: loadingDisc } = useLeadDiscProfile(opportunity?.lead_id);
  const disc = discResult?.data;

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

          {opportunity && <RecordOutcomePanel key={opportunity.id} opportunity={opportunity} />}

          {opportunity && <QualificationPanel key={opportunity.id} opportunity={opportunity} />}

          {opportunity && <CyclePredictionPanel key={opportunity.id} opportunityId={opportunity.id} />}

          {opportunity && <TaskListPanel key={opportunity.id} opportunityId={opportunity.id} />}

          {loadingBattlecard ? (
            <Skeleton className="h-64" />
          ) : battlecard ? (
            <div className="bee-surface bee-bento-pad">
              <BattlecardView card={battlecard} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Battlecard no disponible — la oportunidad puede estar enriqueciéndose.
            </p>
          )}

          {opportunity?.lead_id && (
            <section className="bee-surface bee-bento-pad">
              <h3 className="bee-card-title">Perfil de comunicación (DISC)</h3>
              {loadingDisc ? (
                <Skeleton className="h-48" />
              ) : disc ? (
                <div className="flex flex-wrap items-center gap-4">
                  <DiscRadar d={disc.d_score} i={disc.i_score} s={disc.s_score} c={disc.c_score} className="w-full max-w-[240px]" />
                  <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                    <p>
                      <span className="font-medium text-foreground">Estilo dominante:</span>{" "}
                      <span className="text-muted-foreground">{DISC_LABELS[disc.dominant_style] ?? disc.dominant_style}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Tono preferido:</span>{" "}
                      <span className="text-muted-foreground">{disc.preferred_tone}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Mensajes:</span>{" "}
                      <span className="text-muted-foreground">{disc.preferred_message_length}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Confianza:</span>{" "}
                      <span className="text-muted-foreground">{Math.round(disc.confidence * 100)}%</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Perfil DISC no disponible todavía para este lead.
                </p>
              )}
            </section>
          )}

          <section className="bee-surface bee-bento-pad">
            <h3 className="bee-card-title">Historial</h3>
            {opportunityId && <OpportunityTimeline opportunityId={opportunityId} />}
          </section>

          <section>
            <h3 className="bee-card-title">Artefactos de ejecución</h3>
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
