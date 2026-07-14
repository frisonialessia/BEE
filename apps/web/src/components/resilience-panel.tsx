"use client";

import { useEffect, useState } from "react";
import type { AuditEntry, AuditSummary, DLQSummary, FailedEvent } from "@/lib/types";
import {
  getAuditDecisions,
  getAuditSummary,
  getDLQEvents,
  getDLQSummary,
  resolveDLQEvent,
  retryDLQEvent,
} from "@/lib/api";

// ── DLQ Panel ─────────────────────────────────────────────────────────────────

const DLQ_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:            { label: "Pending",    color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  retrying:           { label: "Retrying",   color: "text-blue-700",   bg: "bg-blue-100 border-blue-200" },
  resolved:           { label: "Resolved",   color: "text-green-700",  bg: "bg-green-100 border-green-200" },
  permanently_failed: { label: "Failed",     color: "text-red-700",    bg: "bg-red-100 border-red-200" },
};

function DLQEventRow({ event, onRetry, onResolve }: {
  event: FailedEvent;
  onRetry: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const cfg = DLQ_STATUS_CONFIG[event.status] ?? DLQ_STATUS_CONFIG.pending;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${event.status === "permanently_failed" ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{event.event_name}</span>
        <span className="text-xs text-gray-400 shrink-0">#{event.attempt_count} attempt{event.attempt_count !== 1 ? "s" : ""}</span>
      </div>

      {event.last_error && (
        <p className="text-xs text-red-600 truncate">{event.last_error}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          {expanded ? "Hide" : "Details"}
        </button>

        {event.status !== "resolved" && event.status !== "permanently_failed" && (
          <button
            onClick={() => onRetry(event.id)}
            className="text-xs px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Retry Now
          </button>
        )}
        {event.status !== "resolved" && (
          <button
            onClick={() => onResolve(event.id)}
            className="text-xs px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
          >
            Resolve
          </button>
        )}
        {event.ceo_alerted && (
          <span className="text-xs text-red-600 font-medium">⚠ CEO Alerted</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs space-y-1">
          <p><span className="font-medium">Type:</span> {event.event_type}</p>
          <p><span className="font-medium">Created:</span> {new Date(event.created_at).toLocaleString()}</p>
          {event.next_retry_at && (
            <p><span className="font-medium">Next retry:</span> {new Date(event.next_retry_at).toLocaleString()}</p>
          )}
          {event.error_history.length > 0 && (
            <div>
              <p className="font-medium">Error history:</p>
              <ul className="ml-2 space-y-0.5">
                {event.error_history.map((h, i) => (
                  <li key={i} className="text-gray-600">#{h.attempt}: {h.error}</li>
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

  useEffect(() => { load(); }, []);

  async function handleRetry(id: string) {
    try {
      await retryDLQEvent(id);
      await load();
    } catch { /* retry failed — reloaded state shows new attempt count */ }
  }

  async function handleResolve(id: string) {
    try {
      await resolveDLQEvent(id, "Manually resolved via dashboard");
      await load();
    } catch { /* handled */ }
  }

  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: "Total", value: summary.total_events, color: "text-gray-700" },
            { label: "Pending", value: summary.pending_count, color: "text-yellow-600" },
            { label: "Resolved", value: summary.resolved_count, color: "text-green-600" },
            { label: "Failed", value: summary.permanently_failed_count, color: "text-red-600" },
            { label: "Due Now", value: summary.due_for_retry_count, color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-2 text-center">
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {["", "pending", "retrying", "resolved", "permanently_failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              statusFilter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {s === "" ? "All" : DLQ_STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">No failed events{statusFilter ? ` with status "${statusFilter}"` : ""}.</p>
          <p className="text-gray-400 text-xs mt-1">BEE is handling all external actions successfully.</p>
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

const AGENT_LABELS: Record<string, string> = {
  strategy_generator: "Strategy Generator",
  executive_agent: "Executive Agent",
  psychographic_analyzer: "Psychographic",
  dark_funnel: "Dark Funnel",
  smart_engagement: "Engagement",
  agent_orchestrator: "Orchestrator",
  workflow_orchestrator: "Workflow",
  trend_analyst: "Trend Analyst",
};

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 0.8 ? "bg-green-100 text-green-700 border-green-200"
    : score >= 0.5 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${color}`}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${entry.manual_review_required ? "border-orange-200 bg-orange-50/30" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
          {AGENT_LABELS[entry.agent_type] ?? entry.agent_type}
        </span>
        <span className="text-sm font-medium text-gray-800 truncate flex-1">
          {entry.decision_type.replace(/_/g, " ")}
        </span>
        <ConfidenceBadge score={entry.confidence_score} />
        {entry.manual_review_required && (
          <span className="text-xs text-orange-700 font-medium">Review Required</span>
        )}
        <span className="text-xs text-gray-400 shrink-0">
          {new Date(entry.created_at).toLocaleTimeString()}
        </span>
      </div>

      {entry.strategy_reasoning && (
        <p className="text-xs text-gray-600 line-clamp-2">{entry.strategy_reasoning}</p>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
      >
        {expanded ? "Hide" : "Full snapshot"}
      </button>

      {expanded && (
        <div className="mt-1 space-y-2">
          {Object.keys(entry.context_snapshot).length > 0 && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-1">Context</p>
              <pre className="text-xs text-gray-700 overflow-auto">{JSON.stringify(entry.context_snapshot, null, 2)}</pre>
            </div>
          )}
          {Object.keys(entry.market_data_used).length > 0 && (
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="text-xs font-medium text-blue-600 mb-1">Market Data Used</p>
              <pre className="text-xs text-gray-700 overflow-auto">{JSON.stringify(entry.market_data_used, null, 2)}</pre>
            </div>
          )}
          {entry.processing_ms && (
            <p className="text-xs text-gray-400">{entry.processing_ms}ms processing time</p>
          )}
        </div>
      )}
    </div>
  );
}

function AuditPanel() {
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
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-gray-200 bg-white p-2 text-center">
            <p className="text-lg font-bold text-gray-900">{summary.total_entries}</p>
            <p className="text-xs text-gray-400">Total Decisions</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-2 text-center">
            <p className="text-lg font-bold text-orange-600">{summary.manual_review_count}</p>
            <p className="text-xs text-gray-400">Need Review</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-2 text-center">
            <p className="text-lg font-bold text-green-600">{(summary.avg_confidence_score * 100).toFixed(0)}%</p>
            <p className="text-xs text-gray-400">Avg Confidence</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-xs text-gray-600">Show only low-confidence decisions</span>
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">No audit entries yet.</p>
          <p className="text-gray-400 text-xs mt-1">Agent decisions will appear here as BEE processes signals.</p>
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
  const [activeTab, setActiveTab] = useState<"dlq" | "audit">("dlq");

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["dlq", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-4 py-2 rounded-lg border font-medium transition-colors ${
              activeTab === tab ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {tab === "dlq" ? "Dead Letter Queue" : "Audit Trail"}
          </button>
        ))}
      </div>
      {activeTab === "dlq" ? <DLQPanel /> : <AuditPanel />}
    </div>
  );
}
