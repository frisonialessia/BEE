"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
  const t = useTranslations("probarNetworkBrandControl.deepLearning.correction");
  const [profile, setProfile] = useState<StyleProfileOut | null>(null);
  const [result, setResult] = useState<CorrectionOut | null>(null);
  const [loading, setLoading] = useState(false);
  // Seeded example values, not just placeholders — same "plausible starting
  // point, in the interface's own language" reasoning as BrandVoicePanel's
  // create-profile form.
  const [original, setOriginal] = useState(t("defaultOriginal"));
  const [edited, setEdited] = useState(t("defaultEdited"));
  const [artifactType, setArtifactType] = useState("email_draft");

  const ARTIFACT_TYPES = [
    ["email_draft", t("artifactTypes.email_draft")],
    ["meeting_agenda", t("artifactTypes.meeting_agenda")],
    ["linkedin_message", t("artifactTypes.linkedin_message")],
    ["next_steps", t("artifactTypes.next_steps")],
  ] as const;

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
      <p className="text-xs text-muted-foreground">{t("description")}</p>

      <div className="grid gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("artifactTypeLabel")}</label>
          <select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value)}
            className="text-xs border border-border rounded-sm px-2 py-2 w-full bg-[var(--color-card)]"
          >
            {ARTIFACT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("originalLabel")}</label>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground"
            style={{ background: "color-mix(in srgb, var(--color-chart-2) 10%, var(--color-background))" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("editedLabel")}</label>
          <textarea
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground"
            style={{ background: "color-mix(in srgb, var(--success) 10%, var(--color-background))" }}
          />
        </div>

        <button onClick={handleSubmit} disabled={loading} className="bee-btn bee-btn--primary">
          {loading ? t("learning") : t("submit")}
        </button>
      </div>

      {result && (
        <div
          className="bee-bento p-4 space-y-2"
          style={{ borderColor: "var(--color-chart-6)", background: "color-mix(in srgb, var(--color-chart-6) 10%, var(--color-background))" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: "var(--color-chart-6)" }}>{t("resultTitle")}</span>
            <span
              className="text-xs px-2 py-1 rounded-sm"
              style={{ background: "color-mix(in srgb, var(--color-chart-6) 20%, var(--color-background))", color: "var(--color-chart-6)" }}
            >
              {t("versionBadge", { version: result.profile_version, count: result.total_corrections })}
            </span>
          </div>
          {result.extracted_rules.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-chart-6)" }}>{t("rulesLearnedTitle")}</p>
              <ul className="space-y-1">
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
            {t("changeRatio", { pct: (result.change_ratio * 100).toFixed(0), count: result.authoritative_rules_count })}
          </p>
        </div>
      )}

      <button onClick={handleLoadProfile} className="text-xs text-muted-foreground hover:text-muted-foreground underline underline-offset-2">
        {t("viewFullProfile")}
      </button>

      {profile && profile.total_corrections > 0 && (
        <div className="bee-bento p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t("currentProfileTitle")}</span>
            <span className="text-xs text-muted-foreground">
              {t("profileStats", { authoritative: profile.authoritative_rules_count, total: profile.total_corrections })}
            </span>
          </div>
          {profile.style_summary ? (
            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-[var(--color-card)] p-2 rounded-sm border border-border">
              {profile.style_summary}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">{t("needMoreCorrections")}</p>
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

function AnomalyAlertCard({ alert, onAcknowledge }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void }) {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
  const SEVERITY_LABEL: Record<string, string> = {
    critical: t("severity.critical"),
    high: t("severity.high"),
    medium: t("severity.medium"),
    low: t("severity.low"),
  };
  const [expanded, setExpanded] = useState(false);
  const varColor = SEVERITY_VAR[alert.severity] ?? null;
  const cardStyle = varColor
    ? { borderColor: varColor, background: `color-mix(in srgb, ${varColor} 8%, var(--color-card))`, color: "var(--color-text)" }
    : undefined;
  const chipStyle = varColor
    ? { color: varColor, borderColor: varColor, background: `color-mix(in srgb, ${varColor} 15%, var(--color-background))` }
    : { color: "var(--color-text)", borderColor: "var(--color-divider)" };

  return (
    <div className="bee-bento p-4 space-y-2" style={cardStyle}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-xs font-semibold leading-tight">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("currentVsBase", {
              rolling: (alert.rolling_rate * 100).toFixed(1),
              baseline: (alert.baseline_rate * 100).toFixed(1),
              deviation: alert.deviation_pct.toFixed(1),
            })}
          </p>
        </div>
        <span className="text-xs font-bold uppercase px-2 py-1 rounded-sm border" style={chipStyle}>
          {SEVERITY_LABEL[alert.severity] ?? alert.severity}
        </span>
      </div>

      {alert.status === "open" && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="text-xs px-3 py-1 rounded-sm border border-current hover:opacity-75 transition-opacity"
        >
          {t("acknowledge")}
        </button>
      )}

      <button onClick={() => setExpanded(v => !v)} className="text-xs underline underline-offset-2 opacity-60">
        {expanded ? t("hideDetails") : t("showDetails")}
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
  const t = useTranslations("probarNetworkBrandControl.deepLearning.anomaly");
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
    await acknowledgeAnomaly(id, t("acknowledgeNote"));
    await load();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("description")}</p>

      <button onClick={handleCheck} disabled={checking} className="bee-btn bee-btn--primary">
        {checking ? t("scanning") : t("runScan")}
      </button>

      {summary && (
        <div className="bee-bento p-2 text-xs text-muted-foreground">
          {summary}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
          <p className="bee-caption mt-1">{t("empty.hint")}</p>
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

type TabId = "correction" | "anomaly";

export function DeepLearningPanel() {
  const t = useTranslations("probarNetworkBrandControl.deepLearning.tabs");
  const [tab, setTab] = useState<TabId>("correction");
  const TABS: { id: TabId; label: string }[] = [
    { id: "correction", label: t("correction") },
    { id: "anomaly", label: t("anomaly") },
  ];

  return (
    // bee-panel — this root used to be a bare <div>, the one card in its
    // grid row (next to BrandVoicePanel, which is a real card) with no
    // border or background of its own.
    <div className="bee-panel space-y-4">
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
      {/* min-h reserves the height of the taller tab (Style learning, with
       * its two textareas) so switching to the shorter one (Anomaly
       * monitor) doesn't shrink this card — which, as a grid sibling of
       * BrandVoicePanel on the Brand Voice page, would otherwise drag that
       * whole row's height down with it and read as a layout jump. */}
      <div className="min-h-[420px]">
        {tab === "correction" && <CorrectionLearningPanel />}
        {tab === "anomaly" && <AnomalyAlertsPanel />}
      </div>
    </div>
  );
}
