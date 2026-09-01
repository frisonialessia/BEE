"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useLeadDiscProfile } from "@/hooks/queries/use-psychographic";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { ApiError } from "@/types/api";
import { CLOSED_OPPORTUNITY_STATUSES } from "@/types/domain";

/** Drawer CRM — detalle in-place sin navegación. */
export function OpportunityDrawer() {
  const t = useTranslations("crm.drawer");
  const tStage = useTranslations("crm.board");
  const { opportunityId, closeOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();

  const DISC_LABELS: Record<string, string> = {
    D: t("disc.labels.D"),
    I: t("disc.labels.I"),
    S: t("disc.labels.S"),
    C: t("disc.labels.C"),
    UNKNOWN: t("disc.labels.UNKNOWN"),
  };

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

  // Misma acción que el <select> "Mover a" de cada CrmCard en el tablero —
  // acá también, para que mover de etapa no dependa de estar viendo el
  // Kanban. Solo para etapas abiertas: cerrar sigue siendo una acción
  // dedicada (RecordOutcomePanel), no un simple cambio de estado.
  const isClosed = opportunity ? CLOSED_OPPORTUNITY_STATUSES.includes(opportunity.status) : false;

  function handleMoveStage(stage: CrmStage) {
    if (!opportunity || opportunity.status === stage) return;
    moveStage.mutate(
      { id: opportunity.id, stage },
      {
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : t("moveError"));
        },
      },
    );
  }

  return (
    <>
      <button
        type="button"
        className="bee-drawer-overlay"
        aria-label={t("closeOverlay")}
        onClick={closeOpportunity}
      />
      <aside
        className="bee-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogLabel")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p className="bee-eyebrow">{t("eyebrow")}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {opportunity?.title.replace(/^Opportunity:\s*/, "") ?? t("loading")}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {opportunity && !isClosed && (
              <select
                value={opportunity.status}
                onChange={(e) => handleMoveStage(e.target.value as CrmStage)}
                aria-label={t("moveToStage")}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
              >
                {CRM_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {tStage(`stages.${s.id}`)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={closeOpportunity}
              className="rounded-sm p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-foreground"
              aria-label={t("close")}
            >
              <X className="size-5 stroke-[1.25]" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {battlecardResult?.live === false && (
            <Badge variant="warning">{t("demo")}</Badge>
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
            <p className="text-sm text-muted-foreground">{t("battlecardUnavailable")}</p>
          )}

          {opportunity?.lead_id && (
            <section className="bee-surface bee-bento-pad">
              <h3 className="bee-card-title">{t("disc.title")}</h3>
              {loadingDisc ? (
                <Skeleton className="h-48" />
              ) : disc ? (
                <div className="flex flex-wrap items-center gap-4">
                  <DiscRadar d={disc.d_score} i={disc.i_score} s={disc.s_score} c={disc.c_score} className="w-full max-w-[240px]" />
                  <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                    <p>
                      <span className="font-medium text-foreground">{t("disc.dominantStyle")}</span>{" "}
                      <span className="text-muted-foreground">{DISC_LABELS[disc.dominant_style] ?? disc.dominant_style}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">{t("disc.preferredTone")}</span>{" "}
                      <span className="text-muted-foreground">{disc.preferred_tone}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">{t("disc.messages")}</span>{" "}
                      <span className="text-muted-foreground">{disc.preferred_message_length}</span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">{t("disc.confidence")}</span>{" "}
                      <span className="text-muted-foreground">{Math.round(disc.confidence * 100)}%</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("disc.unavailable")}</p>
              )}
            </section>
          )}

          <section className="bee-surface bee-bento-pad">
            <h3 className="bee-card-title">{t("history")}</h3>
            {opportunityId && <OpportunityTimeline opportunityId={opportunityId} />}
          </section>

          <section>
            <h3 className="bee-card-title">{t("artifacts.title")}</h3>
            {loadingArtifacts ? (
              <Skeleton className="h-48" />
            ) : artifacts ? (
              <ExecutionArtifacts bundle={artifacts} opportunityId={opportunityId!} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("artifacts.unavailable")}</p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
