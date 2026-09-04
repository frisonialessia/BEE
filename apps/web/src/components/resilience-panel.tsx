"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { EmptyLine, Meter, RowsSkeleton, StateChip, StateWord, useFittedRows, ViewAllButton, type DotLevel } from "@/features/control/components/primitives";
import { Pill } from "@/features/crm/drawer/primitives";
import { useAuditDecisions, useAuditSummary, useDlqEvents, useDlqSummary, useResolveDlqEvent, useRetryDlqEvent } from "@/hooks/queries/use-resilience";
import type { Locale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/i18n/format";
import type { AuditEntry, DLQStatus, DLQSummary, FailedEvent } from "@/lib/types";

/** Row height contract with useFittedRows: two lines + padding. */
const ROW_PX = 57;

// ── Eventos fallidos (DLQ) ─────────────────────────────────────────────────────

/** What failed on the way out wants a person: magenta. Given up is the
 *  full hue, waiting for a retry is 70, retrying is 45, resolved is REST. */
const DLQ_HUE = TONE.urgency;
const DLQ_LEVEL: Record<DLQStatus, DotLevel> = {
  permanently_failed: 100,
  pending: 70,
  retrying: 45,
  resolved: "rest",
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

function DLQEventRow({ event, onRetry, onResolve, busy }: { event: FailedEvent; onRetry: (id: string) => void; onResolve: (id: string) => void; busy: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.dlq");
  const [expanded, setExpanded] = useState(false);
  const open = event.status !== "resolved";
  const canRetry = event.status === "pending" || event.status === "retrying";
  const meta = [t("attemptCount", { count: event.attempt_count }), event.next_retry_at && open ? t("nextRetryInline", { time: formatDateTime(event.next_retry_at, locale) }) : null, event.ceo_alerted && open ? t("ceoAlerted") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium leading-snug" title={event.last_error ?? undefined}>
          {event.event_name}
        </p>
        <p className="truncate bee-micro">
          {meta}
          {" · "}
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="font-medium text-[var(--color-text)] hover:underline">
            {expanded ? t("hide") : t("details")}
          </button>
        </p>
      </div>
      <StateWord hue={DLQ_HUE} level={DLQ_LEVEL[event.status] ?? "rest"} title={t(`statusHint.${event.status}`)}>
        {t(`status.${event.status}`)}
      </StateWord>
      {open && (
        <span className="flex shrink-0 gap-1.5">
          {canRetry && (
            <button type="button" onClick={() => onRetry(event.id)} disabled={busy} className="bee-btn-ghost text-xs">
              {t("retryNow")}
            </button>
          )}
          <button type="button" onClick={() => onResolve(event.id)} disabled={busy} className="bee-btn-ghost text-xs">
            {t("resolve")}
          </button>
        </span>
      )}
      {expanded && (
        <dl className="basis-full space-y-1 rounded-[var(--radius-md)] bg-[var(--color-background)] p-3 text-xs">
          {event.last_error && open && (
            <div className="flex gap-2">
              <dt className="font-medium">{t("whatFailed")}</dt>
              <dd className="text-[var(--color-text-muted)]">{event.last_error}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-medium">{t("type")}</dt>
            <dd className="text-[var(--color-text-muted)]">{event.event_type}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">{t("created")}</dt>
            <dd className="text-[var(--color-text-muted)]">{formatDateTime(event.created_at, locale)}</dd>
          </div>
          {event.resolution_notes && (
            <div className="flex gap-2">
              <dt className="font-medium">{t("resolution")}</dt>
              <dd className="text-[var(--color-text-muted)]">{event.resolution_notes}</dd>
            </div>
          )}
          {event.error_history.length > 0 && (
            <div>
              <dt className="font-medium">{t("errorHistory")}</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {event.error_history.map((h) => (
                    <li key={h.attempt} className="text-[var(--color-text-muted)]">
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
 * Eventos fallidos — things BEE tried to do outside (send an email, notify
 * the CRM) that did not go through. BEE retries on its own schedule; this
 * box shows what is still stuck and lets a person force a retry now or
 * close it by hand. One row per event, the state as a dot + word, the
 * status filter as pills.
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
  const [listRef, rows, fit] = useFittedRows(filtered, ROW_PX);

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      caption={t("caption")}
      className={fit.expanded ? undefined : "lg:h-[22rem]!"}
      action={
        openCount !== null && openCount > 0 ? (
          <StateChip hue={DLQ_HUE} level={45}>
            {t("openCount", { count: openCount })}
          </StateChip>
        ) : undefined
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t("filterAria")}>
        {(["", ...DLQ_STATUSES] as const).map((s) => {
          const count = summaryCount(summary, s);
          return (
            <Pill key={s || "all"} pressed={statusFilter === s} fill={tint(DLQ_HUE, 45)} onClick={() => setStatusFilter(s)}>
              {s === "" ? t("all") : t(`status.${s}`)}
              {count !== null && <span className="ml-1 tabular-nums text-[var(--color-text-muted)]">{count}</span>}
            </Pill>
          );
        })}
      </div>

      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyLine>{statusFilter ? t("emptyTitleFiltered", { status: t(`status.${statusFilter}`) }) : t("emptyTitleAll")}</EmptyLine>
      ) : (
        <>
          <ul ref={listRef} className={fit.expanded ? "bee-fill min-h-0" : "bee-fill min-h-0 overflow-hidden"}>
            {rows.map((event) => (
              <DLQEventRow key={event.id} event={event} busy={busy} onRetry={(id) => retry.mutate(id)} onResolve={(id) => resolve.mutate({ id, notes: t("resolvedManuallyReason") })} />
            ))}
          </ul>
          <ViewAllButton hidden={fit.hidden} expanded={fit.expanded} onToggle={fit.toggle} />
        </>
      )}
    </OverviewCard>
  );
}

// ── Registro de decisiones (audit trail) ──────────────────────────────────────

/** Decisions are what BEE prepares: lilac. Same ≥0.75 / ≥0.5 thresholds
 *  as scoreColorVar() (lib/format.ts): a confident decision is the full
 *  hue, a middling one 70, a weak one 45 — never an "error" hue. */
const AUDIT_HUE = TONE.prepared;
function confidenceLevel(score: number): 100 | 70 | 45 {
  return score >= 0.75 ? 100 : score >= 0.5 ? 70 : 45;
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [expanded, setExpanded] = useState(false);
  const agentLabel = t.has(`agentLabels.${entry.agent_type}`) ? t(`agentLabels.${entry.agent_type}` as "agentLabels.strategy_generator") : entry.agent_type;
  const level = confidenceLevel(entry.confidence_score);
  const hasContext = Object.keys(entry.context_snapshot).length > 0;
  const hasMarket = Object.keys(entry.market_data_used).length > 0;
  const hasDetail = hasContext || hasMarket || Boolean(entry.processing_ms) || Boolean(entry.strategy_reasoning);

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium capitalize leading-snug" title={entry.strategy_reasoning ?? undefined}>
          {entry.decision_type.replace(/_/g, " ")}
        </p>
        <p className="truncate bee-micro">
          {agentLabel} · {formatDateTime(entry.created_at, locale)}
          {hasDetail && (
            <>
              {" · "}
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="font-medium text-[var(--color-text)] hover:underline">
                {expanded ? t("hide") : t("fullSnapshot")}
              </button>
            </>
          )}
        </p>
      </div>
      {entry.manual_review_required && (
        <StateWord hue={AUDIT_HUE} level={45}>
          {t("reviewRequired")}
        </StateWord>
      )}
      <span className="flex w-20 shrink-0 flex-col items-end gap-1" title={t("confidence", { pct: Math.round(entry.confidence_score * 100) })}>
        <Meter value={entry.confidence_score} hue={AUDIT_HUE} color={tint(AUDIT_HUE, level)} className="w-full" />
        <span className="bee-micro tabular-nums">{Math.round(entry.confidence_score * 100)} %</span>
      </span>
      {expanded && (
        <div className="basis-full space-y-2 rounded-[var(--radius-md)] bg-[var(--color-background)] p-3 text-xs">
          {entry.strategy_reasoning && <p className="text-[var(--color-text-muted)]">{entry.strategy_reasoning}</p>}
          {hasContext && (
            <div>
              <p className="mb-1 font-medium">{t("context")}</p>
              <pre className="overflow-auto text-[var(--color-text-muted)]">{JSON.stringify(entry.context_snapshot, null, 2)}</pre>
            </div>
          )}
          {hasMarket && (
            <div>
              <p className="mb-1 font-medium">{t("marketDataUsed")}</p>
              <pre className="overflow-auto text-[var(--color-text-muted)]">{JSON.stringify(entry.market_data_used, null, 2)}</pre>
            </div>
          )}
          {entry.processing_ms && <p className="bee-micro">{t("processingMs", { ms: entry.processing_ms })}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * Registro de decisiones — every decision an agent made and how confident
 * it was: one row each, confidence as a meter, "Requiere revisión" as a
 * word. The pill narrows the list to the low-confidence ones.
 */
export function AuditLogPanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [reviewOnly, setReviewOnly] = useState(false);
  const { data: summaryResult } = useAuditSummary();
  const { data: entriesResult, isLoading } = useAuditDecisions(reviewOnly, { limit: 30 });
  const summary = summaryResult?.data ?? null;
  const entries = entriesResult?.data ?? [];
  const [listRef, rows, fit] = useFittedRows(entries, ROW_PX);

  return (
    <OverviewCard
      span={6}
      title={t("title")}
      className={fit.expanded ? undefined : "lg:h-[22rem]!"}
      caption={summary ? t("summaryLine", { total: summary.total_entries, review: summary.manual_review_count, pct: Math.round(summary.avg_confidence_score * 100) }) : t("caption")}
      action={
        <Pill pressed={reviewOnly} fill={tint(AUDIT_HUE, 45)} onClick={() => setReviewOnly((v) => !v)}>
          {t("reviewOnlyLabel")}
        </Pill>
      }
    >
      {isLoading ? (
        <RowsSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <EmptyLine>{t("emptyTitle")}</EmptyLine>
      ) : (
        <>
          <ul ref={listRef} className={fit.expanded ? "bee-fill min-h-0" : "bee-fill min-h-0 overflow-hidden"}>
            {rows.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          <ViewAllButton hidden={fit.hidden} expanded={fit.expanded} onToggle={fit.toggle} />
        </>
      )}
    </OverviewCard>
  );
}
