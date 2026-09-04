"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer, type DrawerTabKey } from "@/features/crm/opportunity-drawer-context";
import { useBattlecard } from "@/hooks/queries/use-artifacts";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useMoveOpportunityStage, useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSignals } from "@/hooks/queries/use-signals";
import { useOpportunityTasks } from "@/hooks/queries/use-tasks";
import { useUsers } from "@/hooks/queries/use-users";
import type { CrmStage } from "@/lib/api/opportunities";
import { groupByCrmStage } from "@/lib/crm-board";
import { ApiError } from "@/types/api";

import { LeftPane } from "./left-pane";
import { RightPane } from "./right-pane";
import { accentOf, isClosedStatus } from "./stage-meta";
import { DrawerTopBar, PipelinePosition } from "./top-bar";

/**
 * View mode: one opportunity, two panes. Position in its column (and the
 * prev/next arrows) follow the board's own grouping and order, so "2 de 7
 * en Listas para actuar" means exactly the second card of that column.
 */
export function OpportunityViewPanes({ opportunityId, initialTab }: { opportunityId: string; initialTab?: DrawerTabKey }) {
  const t = useTranslations("crm.drawer");
  const tBoard = useTranslations("crm.board");
  const { openOpportunity } = useOpportunityDrawer();
  const moveStage = useMoveOpportunityStage();

  const { data: oppsResult, isLoading } = useOpportunities(undefined, 300);
  const { data: companiesResult } = useCompanies(300);
  const { data: leadsResult } = useLeads(200);
  const { data: signalsResult } = useSignals(200);
  const { data: users } = useUsers();
  const { data: meetingsData } = useMeetings();
  const { data: tasksResult } = useOpportunityTasks(opportunityId);
  const { data: battlecardResult } = useBattlecard(opportunityId);

  const [tab, setTab] = useState<DrawerTabKey>(initialTab ?? "activity");
  const [meetingCreateOpen, setMeetingCreateOpen] = useState(false);
  const [expandArtifacts, setExpandArtifacts] = useState(initialTab === "strategy");

  const opportunities = useMemo(() => oppsResult?.data ?? [], [oppsResult]);
  const opportunity = opportunities.find((o) => o.id === opportunityId) ?? null;

  const column = useMemo(() => {
    if (!opportunity) return { cards: [] as typeof opportunities, label: "" };
    const { stages, closed } = groupByCrmStage(opportunities);
    if (isClosedStatus(opportunity.status)) return { cards: closed, label: tBoard("stages.closed") };
    const stage = opportunity.status as CrmStage;
    return { cards: stages[stage], label: tBoard(`stages.${stage}`) };
  }, [opportunity, opportunities, tBoard]);
  const index = column.cards.findIndex((o) => o.id === opportunityId);
  const prev = index > 0 ? column.cards[index - 1] : null;
  const next = index >= 0 && index < column.cards.length - 1 ? column.cards[index + 1] : null;

  const company = useMemo(
    () => (opportunity?.company_id ? companiesResult?.data.find((c) => c.id === opportunity.company_id) ?? null : null),
    [companiesResult, opportunity],
  );
  const lead = useMemo(
    () => (opportunity?.lead_id ? leadsResult?.data.find((l) => l.id === opportunity.lead_id) ?? null : null),
    [leadsResult, opportunity],
  );
  const signal = useMemo(
    () => (opportunity?.signal_id ? signalsResult?.data.find((s) => s.id === opportunity.signal_id) ?? null : null),
    [signalsResult, opportunity],
  );
  const owner = useMemo(
    () => (opportunity?.assigned_to_user_id ? users?.find((u) => u.id === opportunity.assigned_to_user_id) ?? null : null),
    [users, opportunity],
  );
  const accountOpps = useMemo(
    () => (opportunity?.company_id ? opportunities.filter((o) => o.company_id === opportunity.company_id) : opportunity ? [opportunity] : []),
    [opportunities, opportunity],
  );
  const meetings = useMemo(
    () =>
      (meetingsData ?? []).filter(
        (m) => m.opportunity_id === opportunityId || (opportunity?.lead_id != null && m.lead_id === opportunity.lead_id && m.opportunity_id == null),
      ),
    [meetingsData, opportunityId, opportunity],
  );
  const tasks = useMemo(() => tasksResult?.data ?? [], [tasksResult]);

  function handleMoveStage(stage: CrmStage) {
    if (!opportunity || opportunity.status === stage) return;
    moveStage.mutate(
      { id: opportunity.id, stage },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : t("moveError")) },
    );
  }

  function handlePrimaryAction() {
    setExpandArtifacts(true);
    setTab("strategy");
  }

  if (isLoading || !opportunity) {
    return (
      <>
        <DrawerTopBar left={<p className="text-sm text-muted-foreground">{t("loading")}</p>} />
        <div className="grid flex-1 gap-6 p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </>
    );
  }

  const hue = accentOf(opportunity);
  const companyName = company?.name ?? battlecardResult?.data.company.name ?? null;

  return (
    <>
      <DrawerTopBar
        left={
          <>
            <PipelinePosition
              index={index + 1}
              count={column.cards.length}
              stageLabel={column.label}
              onPrev={prev ? () => openOpportunity(prev.id, { tab }) : null}
              onNext={next ? () => openOpportunity(next.id, { tab }) : null}
            />
            {battlecardResult?.live === false && <Badge variant="warning">{t("demo")}</Badge>}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)] lg:overflow-hidden">
        <div className="border-b border-[var(--color-divider)] px-4 py-5 sm:px-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <LeftPane
            opportunity={opportunity}
            lead={lead}
            fallbackLead={battlecardResult?.data.lead ?? null}
            company={company}
            fallbackCompany={battlecardResult?.data.company ?? null}
            owner={owner}
            accountOpps={accountOpps}
            hue={hue}
            onViewAmount={() => setTab("notes")}
          />
        </div>
        <div className="px-4 py-5 sm:px-6 lg:overflow-y-auto">
          <RightPane
            opportunity={opportunity}
            companyName={companyName}
            hue={hue}
            signal={signal}
            meetings={meetings}
            tasks={tasks}
            users={users ?? []}
            tab={tab}
            onTabChange={setTab}
            meetingCreateOpen={meetingCreateOpen}
            onMeetingCreateOpenChange={setMeetingCreateOpen}
            expandArtifacts={expandArtifacts}
            onPrimaryAction={handlePrimaryAction}
            onMoveStage={handleMoveStage}
            movingStage={moveStage.isPending}
          />
        </div>
      </div>
    </>
  );
}
