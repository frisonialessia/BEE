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

// BEE's palette has no red/green/yellow scales — severity maps onto the chart
// accents instead: amber (pending/caution) → blue (in progress/info) →
// var(--success), magenta (resolved) → orange (permanently failed, the most
// severe state BEE has a color for).
const DLQ_STATUS_CONFIG: Record<string, { label: string; varColor: string }> = {
  pending: { label: "Pendiente", varColor: "var(--warning)" },
  retrying: { label: "Reintentando", varColor: "var(--color-chart-4)" },
  resolved: { label: "Resuelto", varColor: "var(--success)" },
  permanently_failed: { label: "Fallido", varColor: "var(--color-chart-2)" },
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
  const cfg = DLQ_STATUS_CONFIG[event.status] ?? DLQ_STATUS_CONFIG.pending;
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
        <span className="text-xs px-2 py-0.5 rounded-sm border font-medium" style={statusChipStyle(cfg.varColor)}>
          {cfg.label}
        </span>
        <span className="text-sm font-medium text-foreground truncate flex-1">{event.event_name}</span>
        <span className="text-xs text-muted-foreground shrink-0">#{event.attempt_count} intento{event.attempt_count !== 1 ? "s" : ""}</span>
      </div>

      {event.last_error && (
        <p className="text-xs truncate" style={{ color: "var(--color-chart-2)" }}>{event.last_error}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {expanded ? "Ocultar" : "Detalles"}
        </button>

        {event.status !== "resolved" && event.status !== "permanently_failed" && (
          <button
            onClick={() => onRetry(event.id)}
            className="bee-btn-ghost bee-btn-ghost--fill"
            style={{ "--bee-fill": "var(--color-chart-4)", "--bee-fill-text": "var(--color-background)" } as React.CSSProperties}
          >
            Reintentar ahora
          </button>
        )}
        {event.status !== "resolved" && (
          <button
            onClick={() => onResolve(event.id)}
            className="bee-btn-ghost"
            style={{ borderColor: "var(--success)", color: "var(--success)" }}
          >
            Resolver
          </button>
        )}
        {event.ceo_alerted && (
          <span className="text-xs font-medium" style={{ color: "var(--color-chart-2)" }}>⚠ CEO alertado</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-2 bg-[var(--color-primary)] rounded-sm text-xs space-y-1">
          <p><span className="font-medium">Tipo:</span> {event.event_type}</p>
          <p><span className="font-medium">Creado:</span> {new Date(event.created_at).toLocaleString()}</p>
          {event.next_retry_at && (
            <p><span className="font-medium">Próximo reintento:</span> {new Date(event.next_retry_at).toLocaleString()}</p>
          )}
          {event.error_history.length > 0 && (
            <div>
              <p className="font-medium">Historial de errores:</p>
              <ul className="ml-2 space-y-0.5">
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
      await resolveDLQEvent(id, "Resuelto manualmente desde el panel");
      await load();
    } catch { /* handled */ }
  }

  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: "Total", value: summary.total_events, color: "var(--color-text)" },
            { label: "Pendientes", value: summary.pending_count, color: "var(--warning)" },
            { label: "Resueltos", value: summary.resolved_count, color: "var(--success)" },
            { label: "Fallidos", value: summary.permanently_failed_count, color: "var(--color-chart-2)" },
            { label: "Vencidos ahora", value: summary.due_for_retry_count, color: "var(--color-chart-4)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bee-bento p-2 text-center">
              <p className="bee-stat__val" style={{ color }}>{value}</p>
              <p className="bee-stat__lbl">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bee-filter-tabs">
        {["", "pending", "retrying", "resolved", "permanently_failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`bee-filter-tab ${statusFilter === s ? "bee-filter-tab--active" : ""}`}
          >
            {s === "" ? "Todos" : DLQ_STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-[var(--color-primary)] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No hay eventos fallidos{statusFilter ? ` con estado "${DLQ_STATUS_CONFIG[statusFilter]?.label ?? statusFilter}"` : ""}.
          </p>
          <p className="text-muted-foreground text-xs mt-1">BEE está gestionando todas las acciones externas sin problemas.</p>
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
  strategy_generator: "Generador de estrategia",
  executive_agent: "Agente ejecutivo",
  psychographic_analyzer: "Psicográfico",
  dark_funnel: "Dark Funnel",
  smart_engagement: "Engagement",
  agent_orchestrator: "Orquestador",
  workflow_orchestrator: "Flujo de trabajo",
  trend_analyst: "Analista de tendencias",
};

function ConfidenceBadge({ score }: { score: number }) {
  const varColor = score >= 0.8 ? "var(--success)" : score >= 0.5 ? "var(--warning)" : "var(--color-chart-2)";
  return (
    <span className="text-xs px-2 py-0.5 rounded-sm border font-mono" style={statusChipStyle(varColor)}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

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
        <span className="text-xs bg-[var(--color-primary)] text-muted-foreground px-2 py-0.5 rounded-md">
          {AGENT_LABELS[entry.agent_type] ?? entry.agent_type}
        </span>
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {entry.decision_type.replace(/_/g, " ")}
        </span>
        <ConfidenceBadge score={entry.confidence_score} />
        {entry.manual_review_required && (
          <span className="text-xs font-medium" style={{ color: "var(--color-chart-2)" }}>Requiere revisión</span>
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
        {expanded ? "Ocultar" : "Instantánea completa"}
      </button>

      {expanded && (
        <div className="mt-1 space-y-2">
          {Object.keys(entry.context_snapshot).length > 0 && (
            <div className="p-2 bg-[var(--color-primary)] rounded-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Contexto</p>
              <pre className="text-xs text-foreground overflow-auto">{JSON.stringify(entry.context_snapshot, null, 2)}</pre>
            </div>
          )}
          {Object.keys(entry.market_data_used).length > 0 && (
            <div
              className="p-2 rounded-sm"
              style={{ background: "color-mix(in srgb, var(--color-chart-4) 12%, var(--color-background))" }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-chart-4)" }}>Datos de mercado utilizados</p>
              <pre className="text-xs text-foreground overflow-auto">{JSON.stringify(entry.market_data_used, null, 2)}</pre>
            </div>
          )}
          {entry.processing_ms && (
            <p className="text-xs text-muted-foreground">{entry.processing_ms} ms de procesamiento</p>
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
          <div className="bee-bento p-2 text-center">
            <p className="bee-stat__val">{summary.total_entries}</p>
            <p className="bee-stat__lbl">Total de decisiones</p>
          </div>
          <div
            className="bee-bento p-2 text-center"
            style={{ borderColor: "var(--color-chart-2)", background: "color-mix(in srgb, var(--color-chart-2) 12%, var(--color-background))" }}
          >
            <p className="bee-stat__val" style={{ color: "var(--color-chart-2)" }}>{summary.manual_review_count}</p>
            <p className="bee-stat__lbl">Requieren revisión</p>
          </div>
          <div className="bee-bento p-2 text-center">
            <p className="bee-stat__val" style={{ color: "var(--success)" }}>{(summary.avg_confidence_score * 100).toFixed(0)}%</p>
            <p className="bee-stat__lbl">Confianza promedio</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-xs text-muted-foreground">Mostrar solo decisiones de baja confianza</span>
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-[var(--color-primary)] animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground text-sm">Todavía no hay entradas de auditoría.</p>
          <p className="text-muted-foreground text-xs mt-1">Las decisiones de los agentes van a aparecer aquí a medida que BEE procese señales.</p>
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
      <div className="bee-filter-tabs">
        {(["dlq", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`bee-filter-tab ${activeTab === tab ? "bee-filter-tab--active" : ""}`}
          >
            {tab === "dlq" ? "Cola de eventos fallidos" : "Registro de auditoría"}
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
