"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEntry, AuditSummary, DLQSummary, FailedEvent } from "@/lib/types";
import {
  getAuditDecisions,
  getAuditSummary,
  getDLQEvents,
  getDLQSummary,
  resolveDLQEvent,
  retryDLQEvent,
} from "@/lib/api";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";

// ── DLQ Panel ─────────────────────────────────────────────────────────────────

// BEE's palette has no red/green/yellow scales — severity maps onto the chart
// accents instead: amber (pending/caution) → blue (in progress/info) →
// var(--success), magenta (resolved) → orange (permanently failed, the most
// severe state BEE has a color for).
const DLQ_STATUS_COLOR: Record<string, string> = {
  pending: "var(--warning)",
  retrying: "var(--color-chart-4)",
  resolved: "var(--success)",
  permanently_failed: "var(--color-chart-2)",
};

function statusChipStyle(varColor: string) {
  return {
    color: varColor,
    borderColor: varColor,
    background: `color-mix(in srgb, ${varColor} 15%, var(--color-background))`,
  };
}

function DLQEventRow({ event, onRetry, onResolve }: {
  event: FailedEvent;
  onRetry: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.dlq");
  const varColor = DLQ_STATUS_COLOR[event.status] ?? DLQ_STATUS_COLOR.pending;
  const statusLabel = t(`status.${event.status}` as "status.pending");
  const [expanded, setExpanded] = useState(false);
  const isFailed = event.status === "permanently_failed";

  return (
    <div
      className="bee-bento p-3 space-y-2"
      style={
        isFailed
          ? { borderColor: "var(--color-chart-2)", background: "color-mix(in srgb, var(--color-chart-2) 8%, var(--color-card))" }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-sm border font-medium" style={statusChipStyle(varColor)}>
          {statusLabel}
        </span>
        <span className="text-sm font-medium text-foreground truncate flex-1">{event.event_name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          #{t("attemptCount", { count: event.attempt_count })}
        </span>
      </div>

      {event.last_error && (
        <p className="text-xs truncate" style={{ color: "var(--color-chart-2)" }}>{event.last_error}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {expanded ? t("hide") : t("details")}
        </button>

        {event.status !== "resolved" && event.status !== "permanently_failed" && (
          <button
            onClick={() => onRetry(event.id)}
            className="bee-btn-ghost bee-btn-ghost--fill"
            style={{ "--bee-fill": "var(--color-chart-4)", "--bee-fill-text": "var(--color-background)" } as React.CSSProperties}
          >
            {t("retryNow")}
          </button>
        )}
        {event.status !== "resolved" && (
          <button
            onClick={() => onResolve(event.id)}
            className="bee-btn-ghost"
            style={{ borderColor: "var(--success)", color: "var(--success)" }}
          >
            {t("resolve")}
          </button>
        )}
        {event.ceo_alerted && (
          <span className="text-xs font-medium" style={{ color: "var(--color-chart-2)" }}>{t("ceoAlerted")}</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 rounded-sm border border-border bg-[var(--color-background)] p-2 text-xs space-y-1">
          <p><span className="font-medium">{t("type")}</span> {event.event_type}</p>
          <p><span className="font-medium">{t("created")}</span> {formatDateTime(event.created_at, locale)}</p>
          {event.next_retry_at && (
            <p><span className="font-medium">{t("nextRetry")}</span> {formatDateTime(event.next_retry_at, locale)}</p>
          )}
          {event.error_history.length > 0 && (
            <div>
              <p className="font-medium">{t("errorHistory")}</p>
              <ul className="ml-2 space-y-1">
                {event.error_history.map((h, i) => (
                  <li key={i} className="text-muted-foreground">#{h.attempt}: {h.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DLQPanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.dlq");
  const [summary, setSummary] = useState<DLQSummary | null>(null);
  const [events, setEvents] = useState<FailedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    const [sumResult, eventsResult] = await Promise.all([
      getDLQSummary(),
      getDLQEvents({ limit: 30 }),
    ]);
    setSummary(sumResult.data);
    setEvents(eventsResult.data);
    setLoading(false);
  }

  useEffect(() => {
    // one-time mount fetch; load()'s setState calls happen after the async
    // response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleRetry(id: string) {
    try {
      await retryDLQEvent(id);
      await load();
    } catch { /* retry failed — reloaded state shows new attempt count */ }
  }

  async function handleResolve(id: string) {
    try {
      await resolveDLQEvent(id, t("resolvedManuallyReason"));
      await load();
    } catch { /* handled */ }
  }

  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events;
  const statusOptions = ["", "pending", "retrying", "resolved", "permanently_failed"] as const;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* Misma tarjeta compacta que Dark Funnel/Resumen (p-4, no p-2) —
           * "Total" es la suma de las otras 4, no una cuenta accionable por sí
           * sola, así que se oculta solo en móvil (mismo criterio que "Score
           * medio" en Resumen) para que la fila quede en 2×2. */}
          {[
            { label: t("stats.total"), value: summary.total_events, color: "var(--color-text)", hideOnMobile: true },
            { label: t("stats.pending"), value: summary.pending_count, color: "var(--warning)" },
            { label: t("stats.resolved"), value: summary.resolved_count, color: "var(--success)" },
            { label: t("stats.failed"), value: summary.permanently_failed_count, color: "var(--color-chart-2)" },
            { label: t("stats.dueNow"), value: summary.due_for_retry_count, color: "var(--color-chart-4)" },
          ].map(({ label, value, color, hideOnMobile }) => (
            <div
              key={label}
              className={`bee-bento p-4 text-center ${hideOnMobile ? "hidden sm:block" : ""}`}
            >
              <p className="bee-stat__val" style={{ color }}>{value}</p>
              <p className="bee-stat__lbl mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bee-filter-tabs">
        {statusOptions.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`bee-filter-tab ${statusFilter === s ? "bee-filter-tab--active" : ""}`}
          >
            {s === "" ? t("all") : t(`status.${s}` as "status.pending")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {statusFilter
              ? t("emptyTitleFiltered", { status: t(`status.${statusFilter}` as "status.pending") })
              : t("emptyTitleAll")}
          </p>
          <p className="bee-caption mt-1">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => (
            <DLQEventRow key={event.id} event={event} onRetry={handleRetry} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audit Trail Panel ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  // Same ≥0.75/≥0.5 thresholds as scoreColorVar() (lib/format.ts) — this used
  // to be ≥0.8 with a chart-2/orange floor (the app's destructive color) for
  // merely low-confidence, not failed. Aligning the threshold and swapping
  // the floor to muted keeps "confidence" reading as a spectrum instead of
  // implying an error.
  const varColor = score >= 0.75 ? "var(--success)" : score >= 0.5 ? "var(--warning)" : "var(--color-text-muted)";
  return (
    <span className="text-xs px-2 py-1 rounded-sm border font-mono" style={statusChipStyle(varColor)}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [expanded, setExpanded] = useState(false);
  const agentLabels = {
    strategy_generator: t("agentLabels.strategy_generator"),
    executive_agent: t("agentLabels.executive_agent"),
    psychographic_analyzer: t("agentLabels.psychographic_analyzer"),
    dark_funnel: t("agentLabels.dark_funnel"),
    smart_engagement: t("agentLabels.smart_engagement"),
    agent_orchestrator: t("agentLabels.agent_orchestrator"),
    workflow_orchestrator: t("agentLabels.workflow_orchestrator"),
    trend_analyst: t("agentLabels.trend_analyst"),
  } as Record<string, string>;

  return (
    <div
      className="bee-bento p-3 space-y-2"
      style={
        entry.manual_review_required
          ? { borderColor: "var(--color-chart-2)", background: "color-mix(in srgb, var(--color-chart-2) 8%, var(--color-card))" }
          : undefined
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs bg-[var(--color-primary)] text-muted-foreground px-2 py-1 rounded-md">
          {agentLabels[entry.agent_type] ?? entry.agent_type}
        </span>
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {entry.decision_type.replace(/_/g, " ")}
        </span>
        <ConfidenceBadge score={entry.confidence_score} />
        {entry.manual_review_required && (
          <span className="text-xs font-medium" style={{ color: "var(--color-chart-2)" }}>{t("reviewRequired")}</span>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(entry.created_at).toLocaleTimeString()}
        </span>
      </div>

      {entry.strategy_reasoning && (
        <p className="text-xs text-muted-foreground line-clamp-2">{entry.strategy_reasoning}</p>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {expanded ? t("hide") : t("fullSnapshot")}
      </button>

      {expanded && (
        <div className="mt-1 space-y-2">
          {Object.keys(entry.context_snapshot).length > 0 && (
            <div className="rounded-sm border border-border bg-[var(--color-background)] p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">{t("context")}</p>
              <pre className="text-xs text-foreground overflow-auto">{JSON.stringify(entry.context_snapshot, null, 2)}</pre>
            </div>
          )}
          {Object.keys(entry.market_data_used).length > 0 && (
            <div
              className="p-2 rounded-sm"
              style={{ background: "color-mix(in srgb, var(--color-chart-4) 12%, var(--color-background))" }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-chart-4)" }}>{t("marketDataUsed")}</p>
              <pre className="text-xs text-foreground overflow-auto">{JSON.stringify(entry.market_data_used, null, 2)}</pre>
            </div>
          )}
          {entry.processing_ms && (
            <p className="text-xs text-muted-foreground">{t("processingMs", { ms: entry.processing_ms })}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AuditPanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel.audit");
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [sumResult, entriesResult] = await Promise.all([
        getAuditSummary(),
        getAuditDecisions({ limit: 30, manual_review_required: reviewOnly || undefined }),
      ]);
      setSummary(sumResult.data);
      setEntries(entriesResult.data);
      setLoading(false);
    }
    load();
  }, [reviewOnly]);

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="bee-bento p-4 text-center">
            <p className="bee-stat__val">{summary.total_entries}</p>
            <p className="bee-stat__lbl mt-1">{t("stats.total")}</p>
          </div>
          <div
            className="bee-bento p-4 text-center"
            style={{ borderColor: "var(--color-chart-2)", background: "color-mix(in srgb, var(--color-chart-2) 12%, var(--color-background))" }}
          >
            <p className="bee-stat__val" style={{ color: "var(--color-chart-2)" }}>{summary.manual_review_count}</p>
            <p className="bee-stat__lbl mt-1">{t("stats.reviewRequired")}</p>
          </div>
          <div className="bee-bento p-4 text-center">
            <p className="bee-stat__val" style={{ color: "var(--success)" }}>{(summary.avg_confidence_score * 100).toFixed(0)}%</p>
            <p className="bee-stat__lbl mt-1">{t("stats.avgConfidence")}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Label className="cursor-pointer font-normal">
          <Checkbox checked={reviewOnly} onCheckedChange={(checked) => setReviewOnly(checked === true)} />
          <span className="text-xs text-muted-foreground">{t("reviewOnlyLabel")}</span>
        </Label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="bee-caption mt-1">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Combined Resilience Panel (exported) ──────────────────────────────────────

export function ResiliencePanel() {
  const t = useTranslations("probarNetworkBrandControl.resiliencePanel");
  const [activeTab, setActiveTab] = useState<"dlq" | "audit">("dlq");

  return (
    // bee-panel — this root used to be a bare <div>, the one card in its
    // grid row (next to PendingActionsPanel, which is a real card) with no
    // border or background of its own.
    <div className="bee-panel space-y-4">
      <div className="bee-filter-tabs">
        {(["dlq", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`bee-filter-tab ${activeTab === tab ? "bee-filter-tab--active" : ""}`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>
      {/* min-h: same layout-shift fix as DeepLearningPanel's tab wrapper —
       * DLQPanel (5-col stat grid + its own filter row + list) is taller
       * than AuditPanel (3-col stat grid + a single checkbox row + list);
       * without a floor, switching to the shorter tab shrinks this card and
       * drags its grid sibling PendingActionsPanel's row height down with it. */}
      <div className="min-h-[420px]">
        {activeTab === "dlq" ? <DLQPanel /> : <AuditPanel />}
      </div>
    </div>
  );
}
