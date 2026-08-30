"use client";

import { useState } from "react";
import type { AnomalyAlert, CorrectionOut, StyleProfileOut } from "@/lib/types";
import {
  acknowledgeAnomaly,
  checkAnomalies,
  getAnomalyAlerts,
  getStyleProfile,
  recordCorrection,
} from "@/lib/api";

// ── Correction Learning Panel ─────────────────────────────────────────────────

function CorrectionLearningPanel() {
  const [profile, setProfile] = useState<StyleProfileOut | null>(null);
  const [result, setResult] = useState<CorrectionOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState("¡Espero que estés bien! Somos líderes de la industria en inteligencia de ventas y queríamos contactarte.");
  const [edited, setEdited] = useState("Tu CAC está 40% por encima del promedio de tu sector. Así cerramos esa brecha en 60 días.");
  const [artifactType, setArtifactType] = useState("email_draft");

  async function handleLoadProfile() {
    const r = await getStyleProfile();
    setProfile(r.data);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const r = await recordCorrection({ original_content: original, edited_content: edited, artifact_type: artifactType });
      setResult(r.data);
      const p = await getStyleProfile();
      setProfile(p.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Envía un artefacto corregido y BEE extraerá tus preferencias de estilo de escritura automáticamente.
        La IA aplicará estas reglas en cada generación futura — sin necesidad de configuración.
      </p>

      <div className="grid gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de artefacto</label>
          <select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value)}
            className="text-xs border border-border rounded-sm px-2 py-1.5 w-full bg-[var(--color-card)]"
          >
            {(
              [
                ["email_draft", "Borrador de email"],
                ["meeting_agenda", "Agenda de reunión"],
                ["linkedin_message", "Mensaje de LinkedIn"],
                ["next_steps", "Próximos pasos"],
              ] as const
            ).map(([t, label]) => (
              <option key={t} value={t}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Original (salida de BEE)</label>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground"
            style={{ background: "color-mix(in srgb, var(--color-chart-2) 10%, var(--color-background))" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Editado (tu versión)</label>
          <textarea
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground"
            style={{ background: "color-mix(in srgb, var(--success) 10%, var(--color-background))" }}
          />
        </div>

        <button onClick={handleSubmit} disabled={loading} className="bee-btn bee-btn--primary">
          {loading ? "Aprendiendo..." : "Enviar corrección"}
        </button>
      </div>

      {result && (
        <div
          className="bee-bento p-3 space-y-2"
          style={{ borderColor: "var(--color-chart-6)", background: "color-mix(in srgb, var(--color-chart-6) 10%, var(--color-background))" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: "var(--color-chart-6)" }}>Resultado del aprendizaje</span>
            <span
              className="text-xs px-2 py-0.5 rounded-sm"
              style={{ background: "color-mix(in srgb, var(--color-chart-6) 20%, var(--color-background))", color: "var(--color-chart-6)" }}
            >
              v{result.profile_version} — {result.total_corrections} corrección{result.total_corrections !== 1 ? "es" : ""}
            </span>
          </div>
          {result.extracted_rules.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-chart-6)" }}>Reglas aprendidas de esta edición:</p>
              <ul className="space-y-0.5">
                {result.extracted_rules.map((r) => (
                  <li key={r} className="text-xs text-foreground flex items-center gap-1">
                    <span style={{ color: "var(--color-chart-6)" }}>→</span>
                    {r.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Ratio de cambio: {(result.change_ratio * 100).toFixed(0)}% · {result.authoritative_rules_count} regla{result.authoritative_rules_count !== 1 ? "s" : ""} autoritativa{result.authoritative_rules_count !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <button onClick={handleLoadProfile} className="text-xs text-muted-foreground hover:text-muted-foreground underline underline-offset-2">
        Ver perfil de estilo completo
      </button>

      {profile && profile.total_corrections > 0 && (
        <div className="bee-bento p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Perfil de estilo actual</span>
            <span className="text-xs text-muted-foreground">
              {profile.authoritative_rules_count} autoritativas · {profile.total_corrections} correcciones
            </span>
          </div>
          {profile.style_summary ? (
            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-[var(--color-card)] p-2 rounded-sm border border-border">
              {profile.style_summary}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">Se necesitan más correcciones para construir reglas autoritativas.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Anomaly Alerts Panel ──────────────────────────────────────────────────────

// No red/orange/yellow scale in BEE — severity maps onto the chart accents:
// orange (critical, the most severe color the palette has) → amber (high)
// → gold (medium) → the neutral primary tint (low).
const SEVERITY_VAR: Record<string, string | null> = {
  critical: "var(--color-chart-2)",
  high: "var(--color-chart-1)",
  medium: "var(--color-chart-3)",
  low: null,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "crítica",
  high: "alta",
  medium: "media",
  low: "baja",
};

function AnomalyAlertCard({ alert, onAcknowledge }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const varColor = SEVERITY_VAR[alert.severity] ?? null;
  const cardStyle = varColor
    ? { borderColor: varColor, background: `color-mix(in srgb, ${varColor} 8%, var(--color-card))`, color: "var(--color-text)" }
    : undefined;
  const chipStyle = varColor
    ? { color: varColor, borderColor: varColor, background: `color-mix(in srgb, ${varColor} 15%, var(--color-background))` }
    : { color: "var(--color-text)", borderColor: "var(--color-divider)" };

  return (
    <div className="bee-bento p-3 space-y-2" style={cardStyle}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-xs font-semibold leading-tight">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actual: {(alert.rolling_rate * 100).toFixed(1)}% vs. base {(alert.baseline_rate * 100).toFixed(1)}%
            {" "}({alert.deviation_pct.toFixed(1)}%)
          </p>
        </div>
        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-sm border" style={chipStyle}>
          {SEVERITY_LABEL[alert.severity] ?? alert.severity}
        </span>
      </div>

      {alert.status === "open" && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="text-xs px-3 py-1 rounded-sm border border-current hover:opacity-75 transition-opacity"
        >
          Confirmar
        </button>
      )}

      <button onClick={() => setExpanded(v => !v)} className="text-xs underline underline-offset-2 opacity-60">
        {expanded ? "Ocultar" : "Detalles y acciones"}
      </button>

      {expanded && (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">{alert.description}</p>
          {alert.suggested_actions.length > 0 && (
            <ul className="space-y-1">
              {alert.suggested_actions.map((a, i) => (
                <li key={i} className="flex gap-1"><span>•</span><span>{a}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AnomalyAlertsPanel() {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState("");

  async function load() {
    setLoading(true);
    const r = await getAnomalyAlerts({ status: "open" });
    setAlerts(r.data);
    setLoading(false);
  }

  async function handleCheck() {
    setChecking(true);
    try {
      const r = await checkAnomalies();
      setSummary(r.data.summary);
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function handleAcknowledge(id: string) {
    await acknowledgeAnomaly(id, "Revisado desde el panel");
    await load();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Monitorea la tasa de conversión reciente contra el histórico por canal y sector.
        Las caídas anómalas disparan alertas de estrategia que requieren revisión del CEO antes de cualquier cambio.
      </p>

      <button onClick={handleCheck} disabled={checking} className="bee-btn bee-btn--primary">
        {checking ? "Escaneando…" : "Ejecutar escaneo de anomalías"}
      </button>

      {summary && (
        <div className="bee-bento p-2 text-xs text-muted-foreground">
          {summary}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-[var(--color-primary)] animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No hay alertas de anomalías abiertas.</p>
          <p className="text-xs text-muted-foreground mt-1">Ejecuta un escaneo para revisar la salud actual de conversión.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => <AnomalyAlertCard key={a.id} alert={a} onAcknowledge={handleAcknowledge} />)}
        </div>
      )}
    </div>
  );
}

// ── Combined Deep Learning Panel (exported) ───────────────────────────────────

const TABS = [
  { id: "correction", label: "Aprendizaje de estilo" },
  { id: "anomaly", label: "Monitor de anomalías" },
] as const;

type TabId = typeof TABS[number]["id"];

export function DeepLearningPanel() {
  const [tab, setTab] = useState<TabId>("correction");

  return (
    <div className="space-y-4">
      <div className="bee-filter-tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`bee-filter-tab ${tab === id ? "bee-filter-tab--active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* min-h reserves the height of the taller tab (Aprendizaje de estilo,
       * with its two textareas) so switching to the shorter one (Monitor de
       * anomalías) doesn't shrink this card — which, as a grid sibling of
       * BrandVoicePanel on the Voz de marca page, would otherwise drag that
       * whole row's height down with it and read as a layout jump. */}
      <div className="min-h-[420px]">
        {tab === "correction" && <CorrectionLearningPanel />}
        {tab === "anomaly" && <AnomalyAlertsPanel />}
      </div>
    </div>
  );
}
