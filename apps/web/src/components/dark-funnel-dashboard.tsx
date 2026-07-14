"use client";

import { useEffect, useState } from "react";
import type { DarkFunnelSummary, HotLeadScore } from "@/lib/types";
import { getDarkFunnelHotLeads, getDarkFunnelSummary, ingestDarkFunnelSignal } from "@/lib/api";

const STAGE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ready_to_buy: { label: "Ready to Buy", color: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  decision:     { label: "Decision",     color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  consideration:{ label: "Consideration",color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500" },
  awareness:    { label: "Awareness",    color: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-400" },
};

const SIGNAL_TYPES = [
  "pricing_view",
  "competitor_compare",
  "review_visit",
  "demo_watch",
  "product_trial",
  "case_study_view",
  "content_read",
  "job_posting",
  "search",
  "repeat_visit",
];

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 55 ? "bg-orange-500" : score >= 30 ? "bg-yellow-500" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-700 w-8 text-right">{score.toFixed(0)}</span>
    </div>
  );
}

function HotLeadCard({ lead }: { lead: HotLeadScore }) {
  const stage = STAGE_CONFIG[lead.buying_stage] ?? STAGE_CONFIG.awareness;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${lead.is_hot ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {lead.is_hot && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                HOT
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900 truncate">
              {lead.company_name ?? lead.company_domain}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{lead.company_domain}</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${stage.color}`}>
          {stage.label}
        </span>
      </div>

      <ScoreBar score={lead.research_intensity_score} />

      <div className="flex flex-wrap gap-1">
        {lead.signal_types_seen.slice(0, 4).map((t) => (
          <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
            {t.replace(/_/g, " ")}
          </span>
        ))}
        {lead.signal_types_seen.length > 4 && (
          <span className="text-xs text-gray-400">+{lead.signal_types_seen.length - 4} more</span>
        )}
      </div>

      {lead.top_intent_keywords.length > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Intent: </span>
          {lead.top_intent_keywords.slice(0, 4).join(", ")}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{lead.signal_count} signal{lead.signal_count !== 1 ? "s" : ""}</span>
        {lead.last_signal_at && (
          <span>Last: {new Date(lead.last_signal_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

export function DarkFunnelDashboard() {
  const [hotLeads, setHotLeads] = useState<HotLeadScore[]>([]);
  const [summary, setSummary] = useState<DarkFunnelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("");

  // Simulate signal form state
  const [showSimulate, setShowSimulate] = useState(false);
  const [simDomain, setSimDomain] = useState("");
  const [simSignalType, setSimSignalType] = useState("pricing_view");
  const [simKeywords, setSimKeywords] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [leadsResult, summaryResult] = await Promise.all([
        getDarkFunnelHotLeads({ limit: 20 }),
        getDarkFunnelSummary(),
      ]);
      setHotLeads(leadsResult.data);
      setSummary(summaryResult.data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = stageFilter ? hotLeads.filter((l) => l.buying_stage === stageFilter) : hotLeads;

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!simDomain.trim()) return;
    setSimLoading(true);
    try {
      await ingestDarkFunnelSignal({
        company_domain: simDomain.trim(),
        signal_type: simSignalType,
        intent_keywords: simKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      // Reload data
      const [leadsResult, summaryResult] = await Promise.all([
        getDarkFunnelHotLeads({ limit: 20 }),
        getDarkFunnelSummary(),
      ]);
      setHotLeads(leadsResult.data);
      setSummary(summaryResult.data);
      setSimDomain("");
      setSimKeywords("");
      setShowSimulate(false);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Hot Leads", value: summary.total_hot_leads, accent: "text-red-600" },
            { label: "Ready to Buy", value: summary.ready_to_buy_count, accent: "text-orange-600" },
            { label: "Decision Stage", value: summary.decision_stage_count, accent: "text-yellow-600" },
            { label: "Today's Signals", value: summary.total_signals_today, accent: "text-blue-600" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3 text-center">
              <p className={`text-2xl font-bold ${accent}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {["", "ready_to_buy", "decision", "consideration", "awareness"].map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                stageFilter === stage
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {stage === "" ? "All" : STAGE_CONFIG[stage]?.label ?? stage}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSimulate((v) => !v)}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors"
        >
          + Simulate Signal
        </button>
      </div>

      {/* Simulate form */}
      {showSimulate && (
        <form onSubmit={handleSimulate} className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Simulate an Intent Signal</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={simDomain}
              onChange={(e) => setSimDomain(e.target.value)}
              placeholder="company-domain.com"
              className="col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
            <select
              value={simSignalType}
              onChange={(e) => setSimSignalType(e.target.value)}
              className="col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              {SIGNAL_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <input
              value={simKeywords}
              onChange={(e) => setSimKeywords(e.target.value)}
              placeholder="intent keywords (comma-separated)"
              className="col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={simLoading}
            className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {simLoading ? "Sending…" : "Send Signal"}
          </button>
        </form>
      )}

      {/* Hot leads grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <p className="text-gray-500 text-sm">No intent signals yet.</p>
          <p className="text-gray-400 text-xs mt-1">Use the simulator above to send a test signal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((lead) => (
            <HotLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
