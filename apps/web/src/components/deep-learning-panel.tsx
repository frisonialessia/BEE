"use client";

import { useState } from "react";
import type {
  AnomalyAlert,
  CorrectionOut,
  ScenarioResult,
  StyleProfileOut,
} from "@/lib/types";
import {
  acknowledgeAnomaly,
  checkAnomalies,
  getAnomalyAlerts,
  getStyleProfile,
  recordCorrection,
  runScenario,
} from "@/lib/api";

// ── Correction Learning Panel ─────────────────────────────────────────────────

function CorrectionLearningPanel() {
  const [profile, setProfile] = useState<StyleProfileOut | null>(null);
  const [result, setResult] = useState<CorrectionOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState("Hope you're well! We are industry-leading in sales intelligence and wanted to reach out.");
  const [edited, setEdited] = useState("Your CAC is 40% above your sector average. Here's how we close that gap in 60 days.");
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
        Submit a corrected artifact and BEE will extract your writing style preferences automatically.
        The AI will apply these rules to every future generation — no configuration needed.
      </p>

      <div className="grid gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Artifact Type</label>
          <select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value)}
            className="text-xs border border-border rounded-sm px-2 py-1.5 w-full bg-[var(--color-card)]"
          >
            {["email_draft", "meeting_agenda", "linkedin_message", "next_steps"].map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Original (BEE&apos;s output)</label>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground bg-red-50/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Edited (your version)</label>
          <textarea
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-sm p-2 resize-none font-mono text-foreground bg-green-50/30"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 text-xs rounded-none bg-indigo-600 text-[var(--color-background)] hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? "Learning..." : "Submit Correction"}
        </button>
      </div>

      {result && (
        <div className="rounded-none border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-800">Learning Result</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-sm">
              v{result.profile_version} — {result.total_corrections} correction{result.total_corrections !== 1 ? "s" : ""}
            </span>
          </div>
          {result.extracted_rules.length > 0 && (
            <div>
              <p className="text-xs text-indigo-600 font-medium mb-1">Rules learned from this edit:</p>
              <ul className="space-y-0.5">
                {result.extracted_rules.map((r) => (
                  <li key={r} className="text-xs text-foreground flex items-center gap-1">
                    <span className="text-indigo-500">→</span>
                    {r.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Change ratio: {(result.change_ratio * 100).toFixed(0)}% · {result.authoritative_rules_count} authoritative rule{result.authoritative_rules_count !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      <button onClick={handleLoadProfile} className="text-xs text-muted-foreground hover:text-muted-foreground underline underline-offset-2">
        View full style profile
      </button>

      {profile && profile.total_corrections > 0 && (
        <div className="rounded-none border border-border bg-[var(--color-primary)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Current Style Profile</span>
            <span className="text-xs text-muted-foreground">
              {profile.authoritative_rules_count} authoritative · {profile.total_corrections} corrections
            </span>
          </div>
          {profile.style_summary ? (
            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-[var(--color-card)] p-2 rounded-sm border border-border">
              {profile.style_summary}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">More corrections needed to build authoritative rules.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scenario Simulator Panel ──────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n.toFixed(0)}`;
}

function ScenarioSimulatorPanel() {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sector, setSector] = useState("fintech");
  const [channel, setChannel] = useState("email");
  const [disc, setDisc] = useState("");
  const [signals, setSignals] = useState(10);
  const [heat, setHeat] = useState(0);
  const [reps, setReps] = useState(0);

  async function handleRun() {
    setLoading(true);
    try {
      const r = await runScenario({
        sector: sector || undefined,
        channel: channel || undefined,
        psychographic_style: disc || undefined,
        target_monthly_signals: signals,
        additional_prospecting_reps: reps,
        dark_funnel_heat: heat || undefined,
      });
      setResult(r.data);
    } finally {
      setLoading(false);
    }
  }

  const scenarios = result ? [
    { variant: result.conservative, color: "text-red-600", bg: "bg-red-50", label: "Conservative" },
    { variant: result.realistic, color: "text-blue-600", bg: "bg-blue-50", label: "Realistic" },
    { variant: result.optimistic, color: "text-green-600", bg: "bg-green-50", label: "Optimistic" },
  ] : [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Run a What-If simulation to project revenue from any combination of sector, channel, and DISC style.
        Uses real win-rate history from your FeedbackLoop.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Sector</label>
          <input value={sector} onChange={(e) => setSector(e.target.value)}
            placeholder="fintech, saas…" className="w-full text-xs border border-border rounded-sm px-2 py-1.5" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}
            className="w-full text-xs border border-border rounded-sm px-2 py-1.5 bg-[var(--color-card)]">
            {["email", "linkedin", "warm_intro", "twitter"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">DISC Style</label>
          <select value={disc} onChange={(e) => setDisc(e.target.value)}
            className="w-full text-xs border border-border rounded-sm px-2 py-1.5 bg-[var(--color-card)]">
            <option value="">Any</option>
            {["D", "I", "S", "C"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Monthly Signals: {signals}</label>
          <input type="range" min={1} max={100} value={signals} onChange={(e) => setSignals(+e.target.value)}
            className="w-full" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Dark Funnel Heat: {heat}</label>
          <input type="range" min={0} max={100} value={heat} onChange={(e) => setHeat(+e.target.value)}
            className="w-full" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Extra Reps: {reps}</label>
          <input type="range" min={0} max={10} value={reps} onChange={(e) => setReps(+e.target.value)}
            className="w-full" />
        </div>
      </div>

      <button onClick={handleRun} disabled={loading}
        className="w-full px-4 py-2 text-xs rounded-none bg-blue-600 text-[var(--color-background)] hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
        {loading ? "Simulating…" : "Run Scenario"}
      </button>

      {result && (
        <div className="space-y-3">
          {result.low_data_confidence && (
            <div className="text-xs bg-yellow-50 border border-yellow-200 rounded-none p-2 text-yellow-700">
              ⚠ Low data confidence — only {result.historical_sample_size} historical data point(s). Projections have wide uncertainty.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {scenarios.map(({ variant, color, bg, label }) => (
              <div key={label} className={`rounded-none border p-3 ${bg}`}>
                <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{fmt(variant.annual_revenue)}</p>
                <p className="text-xs text-muted-foreground">{fmt(variant.monthly_revenue)}/mo</p>
                <p className="text-xs text-muted-foreground">{(variant.win_rate * 100).toFixed(1)}% close rate</p>
              </div>
            ))}
          </div>

          <div className="rounded-none border border-border bg-[var(--color-card)] p-3 space-y-2 text-xs">
            <p className="font-medium text-foreground">
              Effective win rate: <span className="text-blue-600">{(result.effective_win_rate * 100).toFixed(1)}%</span>
              {" "}(base {(result.base_win_rate * 100).toFixed(1)}%)
            </p>
            {result.key_drivers.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Key drivers:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {result.key_drivers.map((d, i) => <li key={i}>✓ {d}</li>)}
                </ul>
              </div>
            )}
            {result.recommended_actions.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Recommended:</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {result.recommended_actions.map((a, i) => <li key={i}>→ {a}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Anomaly Alerts Panel ──────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-300 bg-red-50/50 text-red-700",
  high:     "border-orange-300 bg-orange-50/50 text-orange-700",
  medium:   "border-yellow-300 bg-yellow-50/50 text-yellow-700",
  low:      "border-border bg-[var(--color-primary)] text-foreground",
};

function AnomalyAlertCard({ alert, onAcknowledge }: { alert: AnomalyAlert; onAcknowledge: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.low;

  return (
    <div className={`rounded-none border p-3 space-y-2 ${style}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-xs font-semibold leading-tight">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rolling: {(alert.rolling_rate * 100).toFixed(1)}% vs baseline {(alert.baseline_rate * 100).toFixed(1)}%
            {" "}({alert.deviation_pct.toFixed(1)}%)
          </p>
        </div>
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-sm border ${SEVERITY_STYLE[alert.severity]}`}>
          {alert.severity}
        </span>
      </div>

      {alert.status === "open" && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="text-xs px-3 py-1 rounded-sm border border-current hover:opacity-75 transition-opacity"
        >
          Acknowledge
        </button>
      )}

      <button onClick={() => setExpanded(v => !v)} className="text-xs underline underline-offset-2 opacity-60">
        {expanded ? "Hide" : "Details & actions"}
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
    await acknowledgeAnomaly(id, "Reviewed via dashboard");
    await load();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Monitors rolling conversion rates against historical baselines across channels and sectors.
        Anomalous drops trigger strategy alerts requiring CEO review before any change is made.
      </p>

      <button onClick={handleCheck} disabled={checking}
        className="text-xs px-4 py-2 rounded-none bg-orange-600 text-[var(--color-background)] hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium">
        {checking ? "Scanning…" : "Run Anomaly Scan"}
      </button>

      {summary && (
        <div className="text-xs p-2 bg-[var(--color-primary)] border border-border rounded-none text-muted-foreground">
          {summary}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 rounded-none bg-[var(--color-primary)] animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-none border-2 border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No open anomaly alerts.</p>
          <p className="text-xs text-muted-foreground mt-1">Run a scan to check current conversion rate health.</p>
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
  { id: "correction", label: "Style Learning" },
  { id: "simulator", label: "What-If Simulator" },
  { id: "anomaly", label: "Anomaly Monitor" },
] as const;

type TabId = typeof TABS[number]["id"];

export function DeepLearningPanel() {
  const [tab, setTab] = useState<TabId>("correction");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-xs px-3 py-1.5 rounded-sm border font-medium transition-colors ${
              tab === id ? "bg-[var(--color-text)] text-[var(--color-background)] border-gray-900" : "bg-[var(--color-card)] text-muted-foreground border-border hover:border-gray-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "correction" && <CorrectionLearningPanel />}
      {tab === "simulator" && <ScenarioSimulatorPanel />}
      {tab === "anomaly" && <AnomalyAlertsPanel />}
    </div>
  );
}
