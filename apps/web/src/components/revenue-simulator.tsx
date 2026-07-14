"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { runRevenueSimulation } from "@/lib/api";
import type { RevenueSimulation, SimulatorScenario } from "@/lib/types";

const SIGNAL_TYPES = [
  { value: "funding_round", label: "Funding Round" },
  { value: "hiring", label: "Hiring Surge" },
  { value: "leadership_change", label: "Leadership Change" },
  { value: "tech_adoption", label: "Tech Adoption" },
  { value: "product_launch", label: "Product Launch" },
  { value: "expansion", label: "Expansion" },
];

const CONFIDENCE_COLOR: Record<string, string> = {
  none: "text-zinc-500",
  low: "text-yellow-500",
  medium: "text-blue-400",
  high: "text-green-400",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  none: "No data yet",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const SCENARIO_COLOR: Record<string, string> = {
  Conservative: "bg-zinc-700",
  Realistic: "bg-blue-600",
  Optimistic: "bg-green-600",
};

function ScenarioBar({ scenario, maxDeals }: { scenario: SimulatorScenario; maxDeals: number }) {
  const pct = maxDeals > 0 ? Math.round((scenario.projected_won_deals / maxDeals) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 w-24">{scenario.label}</span>
        <span className="text-white font-medium">{scenario.projected_won_deals} deals</span>
        {scenario.uplift_vs_baseline > 0 && (
          <span className="text-green-400 text-[10px]">+{scenario.uplift_vs_baseline} vs baseline</span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${SCENARIO_COLOR[scenario.label] ?? "bg-zinc-600"} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RevenueSimulatorWidget() {
  const [signalType, setSignalType] = useState("funding_round");
  const [industry, setIndustry] = useState("");
  const [factor, setFactor] = useState(2);
  const [result, setResult] = useState<RevenueSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await runRevenueSimulation({
        signal_type: signalType,
        industry: industry || undefined,
        increase_factor: factor,
      });
      if (res.live && res.data) {
        setResult(res.data);
      } else {
        setError("Could not reach the BEE API. Make sure the backend is running.");
      }
    } catch {
      setError("Simulation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const maxDeals = result
    ? Math.max(...result.scenarios.map((s) => s.projected_won_deals), 1)
    : 1;
  const realistic = result?.scenarios.find((s) => s.label === "Realistic");

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            Revenue Simulator
          </h3>
          <p className="text-xs text-zinc-500">
            Project the impact of increasing prospecting in a segment
          </p>
        </div>
        {result && (
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${CONFIDENCE_COLOR[result.data_confidence]}`}
          >
            {CONFIDENCE_LABEL[result.data_confidence]}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1 space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Signal</label>
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SIGNAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1 space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Industry</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. SaaS"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="col-span-1 space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Multiplier ({factor}×)
          </label>
          <input
            type="range"
            min={1.5}
            max={5}
            step={0.5}
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
            className="w-full accent-blue-500 mt-2"
          />
        </div>
      </div>

      <button
        onClick={handleRun}
        disabled={loading}
        className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
      >
        {loading ? "Simulating…" : `Simulate ${factor}× Prospecting`}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 pt-1">
          {/* Headline */}
          <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                Realistic projection
              </span>
              <span className="text-lg font-bold text-white">
                {realistic?.projected_won_deals ?? 0}
                <span className="text-xs text-zinc-400 font-normal ml-1">deals</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{result.recommendation}</p>
            {result.top_playbook && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <TrendingUp className="h-3 w-3 text-green-400" />
                Top tactic: <span className="text-zinc-300">{result.top_playbook}</span>
                {result.top_channel && (
                  <> via <span className="text-zinc-300">{result.top_channel}</span></>
                )}
              </div>
            )}
          </div>

          {/* Scenario bars */}
          <div className="space-y-2">
            {result.scenarios.map((s) => (
              <ScenarioBar key={s.label} scenario={s} maxDeals={maxDeals} />
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-zinc-800 rounded-md py-2 px-1">
              <div className="text-xs font-semibold text-white">
                {Math.round(result.historical_win_rate * 100)}%
              </div>
              <div className="text-[10px] text-zinc-500">Win rate</div>
            </div>
            <div className="bg-zinc-800 rounded-md py-2 px-1">
              <div className="text-xs font-semibold text-white">{result.current_pipeline_count}</div>
              <div className="text-[10px] text-zinc-500">Current pipeline</div>
            </div>
            <div className="bg-zinc-800 rounded-md py-2 px-1">
              <div className="text-xs font-semibold text-white">{result.sample_size}</div>
              <div className="text-[10px] text-zinc-500">Data points</div>
            </div>
          </div>

          {/* Disclaimer toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? "Hide" : "Show"} methodology
          </button>
          {showDetails && (
            <p className="text-[10px] text-zinc-600 leading-relaxed">{result.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}
