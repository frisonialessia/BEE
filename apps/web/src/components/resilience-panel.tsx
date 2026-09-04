"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAuditDecisions,
  useAuditSummary,
  useDlqEvents,
  useDlqSummary,
  useResolveDlqEvent,
  useRetryDlqEvent,
} from "@/hooks/queries/use-resilience";
import type { Locale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/i18n/format";
import type { AuditEntry, DLQStatus, DLQSummary, FailedEvent } from "@/lib/types";

// ── Cola de eventos fallidos (DLQ) ────────────────────────────────────────────

const DLQ_STATUS_META: Record<DLQStatus, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: "attention", icon: Clock },
  retrying: { tone: "ok", icon: RotateCw },
  resolved: { tone: "neutral", icon: CircleCheck },
  permanently_failed: { tone: "failed", icon: CircleX },
};

const DLQ_STATUSES: DLQStatus[] = ["pending", "retrying", "resolved", "permanently_failed"];

function summaryCount(summary: DLQSummary | null | undefined, status: DLQStatus | ""): number | null {
  if (!summary) return null;
  switch (status) {
    case "":
      return summary.total_events;
    case "pending":
      return summary.pending_count;
    case "retrying":
      return summary.retrying_count;
    case "resolved":
      return summary.resolved_count;
    case "permanently_failed":
      return summary.permanently_failed_count;
  }
}

function DLQEventRow({
  event,
  onRetry,
  onResolve,
  busy,
}: {
  event: FailedEvent;
  onRetry: (id: string) => void;
  onResolve: (id: string) => void;
  busy: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.dlq");
  const [expanded, setExpanded] = useState(false);
  const meta = DLQ_STATUS_META[event.status] ?? DLQ_STATUS_META.pending;
  const open = event.status !== "resolved";
  const canRetry = event.status === "pending" || event.status === "retrying";

  return (
    <li className="bee-bento bee-bento-pad space-y-2" style={event.status === "permanently_failed" ? { background: mix(DATA.magenta, 5) } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{event.event_name}</p>
          <p className="mt-0.5 bee-micro">
            {t("attemptCount", { count: event.attempt_count })}
            {event.next_retry_at && open && ` · ${t("nextRetryInline", { time: formatDateTime(event.next_retry_at, locale) })}`}
          </p>
        </div>
        <StatusChip tone={meta.tone} icon={meta.icon} label={t(`status.${event.status}`)} title={t(`statusHint.${event.status}`)} />
      </div>

      {event.last_error && open && (
        <p className="truncate text-xs" title={event.last_error}>
          <span className="font-medium">{t("whatFailed")} </span>
          <span className="text-muted-foreground">{event.last_error}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canRetry && (
          <button type="button" onClick={() => onRetry(event.id)} disabled={busy} className="bee-btn bee-btn--primary">
            <RotateCw className="size-3.5" aria-hidden />
            {t("retryNow")}
          </button>
        )}
        {open && (
          <button type="button" onClick={() => onResolve(event.id)} disabled={busy} className="bee-btn-ghost">
            <CircleCheck className="size-3.5" aria-hidden />
            {t("resolve")}
          </button>
        )}
        {event.ceo_alerted && open && (
          <StatusChip tone="attention" icon={Bell} label={t("ceoAlerted")} title={t("ceoAlertedHint")} />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          {expanded ? t("hide") : t("details")}
        </button>
      </div>

      {expanded && (
        <dl className="space-y-1 rounded-[var(--radius-md)] border border-border bg-background p-3 text-xs">
          <div className="flex gap-2"><dt className="font-medium">{t("type")}</dt><dd className="text-muted-foreground">{event.event_type}</dd></div>
          <div className="flex gap-2"><dt className="font-medium">{t("created")}</dt><dd className="text-muted-foreground">{formatDateTime(event.created_at, locale)}</dd></div>
          {event.next_retry_at && (
            <div className="flex gap-2"><dt className="font-medium">{t("nextRetry")}</dt><dd className="text-muted-foreground">{formatDateTime(event.next_retry_at, locale)}</dd></div>
          )}
          {event.resolution_notes && (
            <div className="flex gap-2"><dt className="font-medium">{t("resolution")}</dt><dd className="text-muted-foreground">{event.resolution_notes}</dd></div>
          )}
          {event.error_history.length > 0 && (
            <div>
              <dt className="font-medium">{t("errorHistory")}</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {event.error_history.map((h) => (
                    <li key={h.attempt} className="text-muted-foreground">
                      {t("attemptN", { n: h.attempt })} — {h.error}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}

/**
 * Cola de eventos fallidos — things BEE tried to do outside (send an email,
 * notify the CRM) that did not go through. BEE retries on its own schedule;
 * this box shows what is still stuck and lets a person force a retry now or
 * close it by hand. Counts live in the filter tabs; the four headline
 * numbers are on the strip above the grid (see ResilienceView).
 */
export function FailedEventsPanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.dlq");
  const { data: summaryResult } = useDlqSummary();
  const { data: eventsResult, isLoading } = useDlqEvents(30);
  const retry = useRetryDlqEvent();
  const resolve = useResolveDlqEvent();
  const [statusFilter, setStatusFilter] = useState<DLQStatus | "">("");

  const summary = summaryResult?.data ?? null;
  const events = eventsResult?.data ?? [];
  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events;
  const busy = retry.isPending || resolve.isPending;
  const openCount = summary ? summary.pending_count + summary.retrying_count + summary.permanently_failed_count : null;

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      action={
        openCount !== null && openCount > 0 ? (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: mix(DATA.honey, 30) }}>
            {t("openCount", { count: openCount })}
          </span>
        ) : undefined
      }
    >
      <div className="bee-filter-tabs mb-3" role="tablist" aria-label={t("filterAria")}>
        {(["", ...DLQ_STATUSES] as const).map((s) => {
          const count = summaryCount(summary, s);
          return (
            <button
              key={s || "all"}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`bee-filter-tab ${statusFilter === s ? "bee-filter-tab--active" : ""}`}
            >
              {s === "" ? t("all") : t(`status.${s}`)}
              {count !== null && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <ShieldCheck className="size-5 text-[var(--color-chart-4)]" aria-hidden />
          <p className="text-sm">
            {statusFilter ? t("emptyTitleFiltered", { status: t(`status.${statusFilter}`) }) : t("emptyTitleAll")}
          </p>
          <p className="bee-micro">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <ul className="max-h-[30rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {filtered.map((event) => (
            <DLQEventRow
              key={event.id}
              event={event}
              busy={busy}
              onRetry={(id) => retry.mutate(id)}
              onResolve={(id) => resolve.mutate({ id, notes: t("resolvedManuallyReason") })}
            />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

// ── Registro de decisiones (audit trail) ──────────────────────────────────────

/* Same ≥0.75 / ≥0.5 thresholds as scoreColorVar() (lib/format.ts): a
   confident decision is fine (indigo), a middling one wants a look (honey),
   a weak one is flagged neutral — never an "error" hue for low confidence. */
function confidenceMeta(score: number): { tone: StatusTone; icon: LucideIcon } {
  if (score >= 0.75) return { tone: "ok", icon: CircleCheck };
  if (score >= 0.5) return { tone: "attention", icon: TriangleAlert };
  return { tone: "neutral", icon: TriangleAlert };
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [expanded, setExpanded] = useState(false);
  const agentLabels: Record<string, string> = {
    strategy_generator: t("agentLabels.strategy_generator"),
    executive_agent: t("agentLabels.executive_agent"),
    psychographic_analyzer: t("agentLabels.psychographic_analyzer"),
    dark_funnel: t("agentLabels.dark_funnel"),
    smart_engagement: t("agentLabels.smart_engagement"),
    agent_orchestrator: t("agentLabels.agent_orchestrator"),
    workflow_orchestrator: t("agentLabels.workflow_orchestrator"),
    trend_analyst: t("agentLabels.trend_analyst"),
  };
  const conf = confidenceMeta(entry.confidence_score);
  const hasContext = Object.keys(entry.context_snapshot).length > 0;
  const hasMarket = Object.keys(entry.market_data_used).length > 0;

  return (
    <li className="bee-bento bee-bento-pad space-y-2" style={entry.manual_review_required ? { background: mix(DATA.honey, 6) } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: mix(DATA.violet, 22) }}>
          {agentLabels[entry.agent_type] ?? entry.agent_type}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">{entry.decision_type.replace(/_/g, " ")}</span>
        <StatusChip
          tone={conf.tone}
          icon={conf.icon}
          label={t("confidence", { pct: Math.round(entry.confidence_score * 100) })}
          title={t("confidenceHint")}
        />
        {entry.manual_review_required && <StatusChip tone="attention" icon={TriangleAlert} label={t("reviewRequired")} />}
        <span className="shrink-0 bee-micro">{formatDateTime(entry.created_at, locale)}</span>
      </div>

      {entry.strategy_reasoning && <p className="truncate text-xs text-muted-foreground" title={entry.strategy_reasoning}>{entry.strategy_reasoning}</p>}

      {(hasContext || hasMarket || entry.processing_ms) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          {expanded ? t("hide") : t("fullSnapshot")}
        </button>
      )}

      {expanded && (
        <div className="space-y-2">
          {hasContext && (
            <div className="rounded-[var(--radius-md)] border border-border bg-background p-3">
              <p className="mb-1 text-xs font-medium">{t("context")}</p>
              <pre className="overflow-auto text-xs text-muted-foreground">{JSON.stringify(entry.context_snapshot, null, 2)}</pre>
            </div>
          )}
          {hasMarket && (
            <div className="rounded-[var(--radius-md)] p-3" style={{ background: mix(DATA.violet, 10) }}>
              <p className="mb-1 text-xs font-medium">{t("marketDataUsed")}</p>
              <pre className="overflow-auto text-xs text-muted-foreground">{JSON.stringify(entry.market_data_used, null, 2)}</pre>
            </div>
          )}
          {entry.processing_ms && <p className="bee-micro">{t("processingMs", { ms: entry.processing_ms })}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * Registro de decisiones — every decision an agent made and how confident it
 * was. Secondary by design: collapsed to one summary line until someone
 * wants to know why BEE did something; the list only loads once opened.
 */
export function AuditLogPanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [open, setOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const { data: summaryResult } = useAuditSummary();
  const { data: entriesResult, isLoading } = useAuditDecisions(reviewOnly, { enabled: open });
  const summary = summaryResult?.data ?? null;
  const entries = entriesResult?.data ?? [];

  return (
    <OverviewCard
      span={12}
      title={t("title")}
      caption={t("caption")}
      action={
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="bee-btn-ghost text-xs">
          {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          {open ? t("hideLog") : t("showLog")}
        </button>
      }
    >
      {summary && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            { key: "total", value: String(summary.total_entries) },
            { key: "reviewRequired", value: String(summary.manual_review_count) },
            { key: "avgConfidence", value: `${Math.round(summary.avg_confidence_score * 100)}%` },
          ].map((s) => (
            <div key={s.key} className="flex items-baseline gap-2">
              <dt className="order-2 bee-micro">{t(`stats.${s.key}`)}</dt>
              <dd className="order-1 text-sm font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <Label className="cursor-pointer font-normal">
            <Checkbox checked={reviewOnly} onCheckedChange={(checked) => setReviewOnly(checked === true)} />
            <span className="text-xs text-muted-foreground">{t("reviewOnlyLabel")}</span>
          </Label>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm">{t("emptyTitle")}</p>
              <p className="mt-1 bee-micro">{t("emptySubtitle")}</p>
            </div>
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {entries.map((entry) => (
                <AuditEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </OverviewCard>
  );
}
