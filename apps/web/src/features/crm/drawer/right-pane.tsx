"use client";

import { CalendarPlus, MoreHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { QualificationPanel } from "@/components/forecast/qualification-panel";
import { RecordOutcomePanel } from "@/components/outcome/record-outcome-panel";
import { TaskListPanel } from "@/components/tasks/task-list-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DrawerTabKey } from "@/features/crm/opportunity-drawer-context";
import type { Locale } from "@/i18n/locales";
import type { CrmStage } from "@/lib/api/opportunities";
import { CRM_STAGES } from "@/lib/crm-board";
import { formatNextBestAction, stripOpportunityTitlePrefix } from "@/lib/format";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { UserOut } from "@/types/auth";
import type { Meeting, Opportunity, OpportunityTask, Signal } from "@/types/domain";

import { ActivityTab } from "./activity-tab";
import { DrawerTabs } from "./drawer-tabs";
import { MeetingsTab } from "./meetings-tab";
import { NextStepStrip } from "./next-step-strip";
import { STAGE_ACCENT, isClosedStatus, stepOf } from "./stage-meta";
import { StageStepper } from "./stage-stepper";
import { StrategyTab } from "./strategy-tab";

/** Right pane: the deal itself — title and its three actions, the pipeline
 *  stepper, next action / next step, and the five tabs. */
export function RightPane({
  opportunity,
  companyName,
  hue,
  signal,
  meetings,
  tasks,
  users,
  tab,
  onTabChange,
  meetingCreateOpen,
  onMeetingCreateOpenChange,
  expandArtifacts,
  onPrimaryAction,
  onMoveStage,
  movingStage,
}: {
  opportunity: Opportunity;
  companyName: string | null;
  hue: string;
  signal: Signal | null;
  meetings: Meeting[];
  tasks: OpportunityTask[];
  users: UserOut[];
  tab: DrawerTabKey;
  onTabChange: (tab: DrawerTabKey) => void;
  meetingCreateOpen: boolean;
  onMeetingCreateOpenChange: (open: boolean) => void;
  expandArtifacts: boolean;
  onPrimaryAction: () => void;
  onMoveStage: (stage: CrmStage) => void;
  movingStage: boolean;
}) {
  const t = useTranslations("crm.drawer");
  const tBoard = useTranslations("crm.board");
  const locale = useLocale() as Locale;
  const closed = isClosedStatus(opportunity.status);
  const step = stepOf(opportunity.status);
  const stageLabel = closed ? tBoard(`closedStatus.${opportunity.status as "won" | "lost" | "dismissed"}`) : tBoard(`stages.${step}`);
  const headline = stripOpportunityTitlePrefix(opportunity.title);
  const action = typeof opportunity.strategy?.next_best_action === "string" ? opportunity.strategy.next_best_action : null;
  const openTasks = tasks.filter((tk) => !tk.completed_at).length;

  const tabs = [
    { key: "activity" as const, label: t("tabs.activity") },
    { key: "meetings" as const, label: t("tabs.meetings"), count: meetings.length },
    { key: "strategy" as const, label: t("tabs.strategy") },
    { key: "tasks" as const, label: t("tabs.tasks"), count: openTasks },
    { key: "notes" as const, label: t("tabs.notes") },
  ];

  return (
    <div className="flex min-h-full flex-col gap-4">
      <header className="flex flex-col gap-3">
        <p className="bee-eyebrow truncate">
          {t("pipeline")} · {t("stage")}: {stageLabel} · {t("createdAgo", { time: formatRelativeTime(opportunity.created_at, locale) })}
        </p>
        <h2 className="bee-display line-clamp-2">
          {companyName && <span>{companyName} · </span>}
          {headline}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {!closed && action && (
            <button type="button" onClick={onPrimaryAction} className="bee-btn bee-btn--primary">
              {formatNextBestAction(action, locale)}
            </button>
          )}
          <button
            type="button"
            aria-label={t("actions.calendar")}
            title={t("actions.calendar")}
            onClick={() => {
              onTabChange("meetings");
              onMeetingCreateOpenChange(true);
            }}
            className="bee-btn-ghost bee-btn--icon"
          >
            <CalendarPlus className="size-4" />
          </button>
          {!closed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t("actions.more")} className="bee-btn-ghost bee-btn--icon">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuLabel className="bee-micro">{t("actions.moveTo")}</DropdownMenuLabel>
                {CRM_STAGES.filter((s) => s.id !== opportunity.status).map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => onMoveStage(s.id)} className="gap-2 text-sm">
                    <span className="size-2 rounded-full" style={{ background: STAGE_ACCENT[s.id] }} />
                    {tBoard(`stages.${s.id}`)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onTabChange("notes")} className="text-sm">
                  {t("actions.markWon")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onTabChange("notes")} className="text-sm">
                  {t("actions.markLost")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <StageStepper status={opportunity.status} closedLabel={closed ? stageLabel : null} onMove={onMoveStage} busy={movingStage} />

      <NextStepStrip opportunity={opportunity} meetings={meetings} tasks={tasks} hue={hue} />

      <DrawerTabs tabs={tabs} value={tab} onChange={onTabChange} hue={hue} ariaLabel={t("tabs.aria")} />

      <div role="tabpanel" id={`drawer-panel-${tab}`} aria-labelledby={`drawer-tab-${tab}`} className="min-h-40 flex-1 pb-6">
        {tab === "activity" && (
          <ActivityTab
            opportunity={opportunity}
            companyName={companyName}
            signal={signal}
            meetings={meetings}
            tasks={tasks}
            users={users}
            hue={hue}
            onCreateMeeting={() => {
              onTabChange("meetings");
              onMeetingCreateOpenChange(true);
            }}
            onEditAmount={() => onTabChange("notes")}
          />
        )}
        {tab === "meetings" && (
          <MeetingsTab
            opportunity={opportunity}
            meetings={meetings}
            users={users}
            hue={hue}
            createOpen={meetingCreateOpen}
            onCreateOpenChange={onMeetingCreateOpenChange}
          />
        )}
        {tab === "strategy" && <StrategyTab opportunity={opportunity} hue={hue} expandArtifacts={expandArtifacts} />}
        {tab === "tasks" && <TaskListPanel key={opportunity.id} opportunityId={opportunity.id} />}
        {tab === "notes" && (
          <div className="space-y-4">
            <QualificationPanel key={`q-${opportunity.id}`} opportunity={opportunity} />
            <RecordOutcomePanel key={`o-${opportunity.id}`} opportunity={opportunity} />
          </div>
        )}
      </div>
    </div>
  );
}
