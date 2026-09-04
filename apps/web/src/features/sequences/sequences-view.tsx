"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { TONE, level } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { useRowCapacity } from "@/components/charts/use-row-capacity";
import { CardLink, OverviewCard } from "@/components/dashboard/overview-card";
import { EngagementInboxPanel } from "@/components/engagement-inbox";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { FlowCanvas } from "@/components/sequences/flow-canvas";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkflowStatusPanel } from "@/components/workflow-status";
import { ProbarComingSoon } from "@/features/probar/probar-coming-soon";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useSequence, useSequences } from "@/hooks/queries/use-sequences";
import type { Locale } from "@/i18n/locales";
import { getSequenceExecutions } from "@/lib/api";
import type { DynamicSequenceOut } from "@/lib/api/sequences";
import { formatRelativeTime } from "@/lib/i18n/format";
import { getSignalTypeLabels, stripOpportunityTitlePrefix } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { TIER_LABELS, type SeniorityTier } from "@/lib/relationship-map";
import type { SequenceExecution, SignalType } from "@/lib/types";

import { SequenceEditor } from "./automation-builder";
import { MessageLibrary } from "./message-library";
import { SequenceTimeline } from "./sequence-timeline";

const DAY_MS = 86_400_000;
const OPEN_EXECUTION_STATUSES = ["running", "waiting"];

/** Every enrollment the engine knows — one query, shared by the strip, the
 *  funnel and the rows. */
function useSequenceExecutions() {
  return useQuery({
    queryKey: [...queryKeys.sequences.all, "executions"] as const,
    queryFn: () => getSequenceExecutions(),
  });
}

/** One sequence as a row: name and meta, its status chip, the timeline of
 *  its steps; the steps' conditions unfold below on demand (the detail is
 *  re-read by id so it is always the saved version). */
function SequenceRow({ sequence, enrolled }: { sequence: DynamicSequenceOut; enrolled: number }) {
  const t = useTranslations("workspace.sequences");
  const locale = useLocale() as Locale;
  const signalTypeLabels = getSignalTypeLabels(locale);
  const [open, setOpen] = useState(false);
  const { data: detail } = useSequence(open ? sequence.id : undefined);
  const meta = [
    t("automation.list.stepsCount", { count: sequence.steps.length }),
    sequence.signal_type ? (signalTypeLabels[sequence.signal_type as SignalType] ?? sequence.signal_type) : null,
    sequence.industry,
    sequence.seniority ? (TIER_LABELS[sequence.seniority as SeniorityTier] ?? sequence.seniority) : null,
    t("active.enrolled", { count: enrolled }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-b border-[var(--color-divider)] py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{sequence.name}</p>
          <p className="bee-caption truncate">{sequence.description ? `${sequence.description} · ${meta}` : meta}</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: sequence.status === "active" ? level(TONE.prepared, 2) : "var(--color-background)" }}>
          {t.has(`active.status.${sequence.status}`) ? t(`active.status.${sequence.status}`) : sequence.status}
        </span>
        <CardLink onClick={() => setOpen((v) => !v)}>{open ? t("active.hideSteps") : t("active.showSteps")}</CardLink>
      </div>
      <SequenceTimeline steps={sequence.steps} />
      {open && <div className="mt-3 border-t border-[var(--color-divider)] pt-3">{detail ? <FlowCanvas steps={detail.steps} /> : <Skeleton className="h-16" />}</div>}
    </div>
  );
}

/** The enrollments as hairline rows — who, in which sequence, at which
 *  step, since when; only as many as the box fits. */
function EnrollmentRows({ executions, sequences }: { executions: SequenceExecution[]; sequences: DynamicSequenceOut[] }) {
  const t = useTranslations("workspace.sequences.active");
  const locale = useLocale() as Locale;
  const { data: leadsResult } = useLeads(300);
  const { data: oppsResult } = useOpportunities(undefined, 700);
  const [ref, capacity] = useRowCapacity<HTMLDivElement>(52, 0, { min: 5, max: 12 });
  const leadName = useMemo(() => new Map((leadsResult?.data ?? []).map((l) => [l.id, l.full_name])), [leadsResult]);
  const oppTitle = useMemo(() => new Map((oppsResult?.data ?? []).map((o) => [o.id, stripOpportunityTitlePrefix(o.title)])), [oppsResult]);
  const seqById = useMemo(() => new Map(sequences.map((s) => [s.id, s])), [sequences]);
  const sorted = useMemo(() => [...executions].sort((a, b) => (b.last_advanced_at ?? b.started_at).localeCompare(a.last_advanced_at ?? a.started_at)), [executions]);

  return (
    <div ref={ref} className="bee-fill flex flex-col overflow-hidden">
      {sorted.slice(0, capacity).map((ex) => {
        const seq = seqById.get(ex.sequence_id);
        const step = seq?.steps.find((s) => s.id === ex.current_step_id);
        const who = (ex.lead_id && leadName.get(ex.lead_id)) || (ex.opportunity_id && oppTitle.get(ex.opportunity_id)) || t("unknownContact");
        return (
          <div key={ex.id} className="bee-row" style={{ height: 52 }}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{who}</p>
              <p className="bee-caption truncate">
                {seq?.name ?? ex.sequence_id}
                {step ? ` · ${step.name}` : ""}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: OPEN_EXECUTION_STATUSES.includes(ex.status) ? level(TONE.prepared, 2) : "var(--color-background)" }}>
              {t.has(`executionStatus.${ex.status}`) ? t(`executionStatus.${ex.status}`) : ex.status}
            </span>
            <span className="bee-micro shrink-0">{formatRelativeTime(ex.last_advanced_at ?? ex.started_at, locale)}</span>
          </div>
        );
      })}
      {executions.length > capacity && <p className="bee-micro pt-2">{t("moreEnrollments", { count: executions.length - capacity })}</p>}
    </div>
  );
}

/**
 * Secuencias — what BEE has prepared to reach people, in lilac. Three
 * tabs: Activas (each sequence as a timeline of steps, the open/reply
 * funnel, the enrollments), Rendimiento (the workflow bus and the
 * engagement inbox — gated in the sandbox, where there is no live
 * engine to show) and Biblioteca (the reusable messages). The strip is
 * computed from the sequences and their executions, nothing invented.
 */
export function SequencesView({ sandbox = false }: { sandbox?: boolean } = {}) {
  const t = useTranslations("workspace.sequences");
  const { data: seqResult, isLoading } = useSequences();
  const { data: execResult } = useSequenceExecutions();
  const [editing, setEditing] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const sequences = useMemo(() => seqResult?.data ?? [], [seqResult]);
  const executions = useMemo(() => execResult?.data ?? [], [execResult]);
  const live = Boolean(seqResult?.live);

  const stats = useMemo(() => {
    const active = sequences.filter((s) => s.status === "active").length;
    const open = executions.filter((e) => OPEN_EXECUTION_STATUSES.includes(e.status));
    const hasEvent = (e: SequenceExecution, name: string) => e.events.some((ev) => ev.event === name);
    const replied = executions.filter((e) => hasEvent(e, "replied")).length;
    const replyRate = executions.length > 0 ? replied / executions.length : null;
    // A send is due today when the step the enrollment sits on has waited
    // its delay since the last advance.
    const endOfToday = new Date(nowMs);
    endOfToday.setHours(23, 59, 59, 999);
    const seqById = new Map(sequences.map((s) => [s.id, s]));
    let dueToday = 0;
    for (const e of open) {
      const seq = seqById.get(e.sequence_id);
      const idx = seq?.steps.findIndex((s) => s.id === e.current_step_id) ?? -1;
      if (!seq || idx < 0) continue;
      const delay = idx === 0 ? 0 : (seq.steps[idx - 1].transitions[0]?.delay_days ?? 0);
      const due = new Date(e.last_advanced_at ?? e.started_at).getTime() + delay * DAY_MS;
      if (due <= endOfToday.getTime()) dueToday += 1;
    }
    const funnel = [
      { label: t("funnel.enrolled"), value: executions.length, color: level(TONE.prepared, 0) },
      { label: t("funnel.opened"), value: executions.filter((e) => hasEvent(e, "opened") || hasEvent(e, "accepted")).length, color: level(TONE.prepared, 1) },
      { label: t("funnel.clicked"), value: executions.filter((e) => hasEvent(e, "clicked")).length, color: level(TONE.prepared, 2) },
      { label: t("funnel.replied"), value: replied, color: level(TONE.prepared, 3) },
    ];
    const enrolledBySequence = new Map<string, number>();
    for (const e of executions) enrolledBySequence.set(e.sequence_id, (enrolledBySequence.get(e.sequence_id) ?? 0) + 1);
    return { active, enrolled: open.length, replyRate, dueToday, funnel, enrolledBySequence };
  }, [sequences, executions, nowMs, t]);

  const hasEnrollments = executions.length > 0;

  const activeContent = editing ? (
    <SequenceEditor onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
  ) : (
    // Without enrollments the one card sits outside the grid, so it takes
    // the height of its list instead of a full grid row.
    <div className={hasEnrollments ? "bee-overview" : undefined}>
      <OverviewCard span={hasEnrollments ? 8 : 12} title={t("active.title", { count: sequences.length })} caption={hasEnrollments ? t("active.caption") : t("active.captionNoEnrollments")}>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : sequences.length === 0 ? (
          <p className="bee-caption py-8 text-center">
            {t("automation.list.empty.title")} {t("automation.list.empty.subtitle")}
          </p>
        ) : (
          <div className="flex flex-col">
            {sequences.map((seq) => (
              <SequenceRow key={seq.id} sequence={seq} enrolled={stats.enrolledBySequence.get(seq.id) ?? 0} />
            ))}
          </div>
        )}
      </OverviewCard>

      {hasEnrollments && (
        <>
          <OverviewCard span={4} title={t("funnel.title")} caption={t("funnel.caption")}>
            <HorizontalFunnel rows={stats.funnel} />
          </OverviewCard>
          <OverviewCard span={12} title={t("active.enrollmentsTitle", { count: executions.length })} caption={t("active.enrollmentsCaption")}>
            <EnrollmentRows executions={executions} sequences={sequences} />
          </OverviewCard>
        </>
      )}
    </div>
  );

  const performanceContent = sandbox ? (
    <ProbarComingSoon label={t("view.tabs.performance")} icon={Activity} />
  ) : (
    <div className="bee-overview">
      <WorkflowStatusPanel />
      <EngagementInboxPanel />
    </div>
  );

  return (
    <MergedPageTabs
      defaultValue="active"
      header={
        <div className="min-w-0">
          <p className="bee-eyebrow">{t("view.eyebrow")}</p>
          <h1 className="bee-display mt-1 truncate">{t("view.title")}</h1>
          <p className="bee-caption mt-1 line-clamp-2">{sandbox ? t("probarPage.subtitle") : t("view.subtitle")}</p>
        </div>
      }
      actions={<LiveBadge live={live} />}
      actionsByTab={{
        active: !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="bee-btn bee-btn--primary">
            {t("automation.list.newFlow")}
          </button>
        ) : null,
      }}
      belowTabs={
        <StatStrip cols={4}>
          <StatTile label={t("kpis.activeSequences")} value={stats.active} hint={t("kpis.activeSequencesHint", { count: sequences.length })} tone={TONE.prepared} />
          <StatTile label={t("kpis.enrolled")} value={stats.enrolled} hint={t("kpis.enrolledHint", { count: executions.length })} tone={TONE.forecast} />
          <StatTile
            label={t("kpis.replyRate")}
            value={stats.replyRate === null ? "—" : `${Math.round(stats.replyRate * 100)}%`}
            progress={stats.replyRate ?? undefined}
            hint={stats.replyRate === null ? t("kpis.replyRateEmpty") : undefined}
            tone={TONE.urgency}
          />
          <StatTile label={t("kpis.dueToday")} value={stats.dueToday} hint={t("kpis.dueTodayHint")} tone={TONE.market} />
        </StatStrip>
      }
      tabs={[
        { value: "active", label: t("view.tabs.active"), content: activeContent },
        { value: "performance", label: t("view.tabs.performance"), content: performanceContent },
        { value: "library", label: t("view.tabs.library"), content: <MessageLibrary /> },
      ]}
    />
  );
}

