"use client";

import { useEffect, useState } from "react";
import type { IntroPath, NetworkConnection, NetworkQueryResult, NetworkStats } from "@/lib/types";
import { addNetworkConnection, findIntroPaths, getNetworkConnections, getNetworkStats } from "@/lib/api";

const COVERAGE_CONFIG: Record<string, { label: string; color: string }> = {
  none:     { label: "No coverage",  color: "text-gray-400" },
  weak:     { label: "Weak",         color: "text-yellow-600" },
  moderate: { label: "Moderate",     color: "text-blue-600" },
  strong:   { label: "Strong",       color: "text-green-600" },
};

const INTRO_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  warm_intro: { label: "Warm Intro",  color: "bg-green-100 text-green-800 border-green-200" },
  referral:   { label: "Referral",    color: "bg-blue-100 text-blue-800 border-blue-200" },
  alumni:     { label: "Alumni",      color: "bg-purple-100 text-purple-800 border-purple-200" },
  cold:       { label: "Cold",        color: "bg-gray-100 text-gray-600 border-gray-200" },
};

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span className="flex gap-0.5">
      {[...Array(10)].map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < strength ? "bg-green-500" : "bg-gray-200"}`}
        />
      ))}
    </span>
  );
}

function PathCard({ path }: { path: IntroPath }) {
  const [showDraft, setShowDraft] = useState(false);
  const introType = INTRO_TYPE_CONFIG[path.intro_type] ?? INTRO_TYPE_CONFIG.cold;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${introType.color}`}>
          {introType.label}
        </span>
        <span className="text-xs text-gray-500">
          {path.path_length === 1 ? "Direct" : `${path.path_length}-hop`} · {path.strength_score.toFixed(1)}/10
        </span>
      </div>

      {/* Path visualization */}
      <div className="flex items-center gap-1 text-xs text-gray-600 flex-wrap">
        {path.steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="bg-gray-100 rounded-md px-2 py-0.5 font-medium">{step.person}</span>
            {i < path.steps.length - 1 && <span className="text-gray-400">→</span>}
          </span>
        ))}
      </div>

      <p className="text-xs text-gray-700">{path.action_recommendation}</p>

      {path.draft_ask && (
        <div>
          <button
            onClick={() => setShowDraft((v) => !v)}
            className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            {showDraft ? "Hide" : "View"} intro request draft
          </button>
          {showDraft && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{path.draft_ask}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(path.draft_ask ?? "")}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800"
              >
                Copy to clipboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NetworkNavigatorPanel() {
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Path finder state
  const [targetDomain, setTargetDomain] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [pathResult, setPathResult] = useState<NetworkQueryResult | null>(null);
  const [pathLoading, setPathLoading] = useState(false);

  // Add connection state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addStrength, setAddStrength] = useState(7);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [connsResult, statsResult] = await Promise.all([
        getNetworkConnections(),
        getNetworkStats(),
      ]);
      setConnections(connsResult.data);
      setStats(statsResult.data);
      setLoading(false);
    }
    load();
  }, []);

  async function handleFindPaths(e: React.FormEvent) {
    e.preventDefault();
    if (!targetDomain.trim()) return;
    setPathLoading(true);
    try {
      const result = await findIntroPaths({
        target_domain: targetDomain.trim(),
        target_company: targetCompany.trim() || undefined,
      });
      setPathResult(result.data);
    } finally {
      setPathLoading(false);
    }
  }

  async function handleAddConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addCompany.trim() || !addDomain.trim()) return;
    setAddLoading(true);
    try {
      await addNetworkConnection({
        contact_name: addName.trim(),
        contact_company: addCompany.trim(),
        contact_domain: addDomain.trim(),
        contact_title: addTitle.trim() || undefined,
        relationship_strength: addStrength,
      });
      const [connsResult, statsResult] = await Promise.all([
        getNetworkConnections(),
        getNetworkStats(),
      ]);
      setConnections(connsResult.data);
      setStats(statsResult.data);
      setAddName(""); setAddCompany(""); setAddDomain(""); setAddTitle(""); setAddStrength(7);
      setShowAdd(false);
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Connections", value: stats.total_connections },
            { label: "1st Degree", value: stats.first_degree_count },
            { label: "Companies Covered", value: stats.companies_covered },
            { label: "Avg Strength", value: `${stats.avg_relationship_strength}/10` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Path finder */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Find Introduction Path</h3>
        <form onSubmit={handleFindPaths} className="flex flex-wrap gap-2">
          <input
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder="target-company.com"
            className="flex-1 min-w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            required
          />
          <input
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder="Company name (optional)"
            className="flex-1 min-w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            type="submit"
            disabled={pathLoading}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {pathLoading ? "Searching…" : "Find Paths"}
          </button>
        </form>

        {/* Path results */}
        {pathResult && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                {pathResult.paths_found.length > 0
                  ? `${pathResult.paths_found.length} path(s) found to ${pathResult.target_company}`
                  : `No network paths found to ${pathResult.target_company}`}
              </p>
              {pathResult.network_coverage && (
                <span className={`text-xs font-medium ${COVERAGE_CONFIG[pathResult.network_coverage]?.color}`}>
                  Coverage: {COVERAGE_CONFIG[pathResult.network_coverage]?.label}
                </span>
              )}
            </div>

            {pathResult.cold_outreach_fallback && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                No warm intro paths found. Use DarkFunnel intent signals to personalise cold outreach instead.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pathResult.paths_found.map((path, i) => (
                <PathCard key={i} path={path} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add connection */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Network Connections ({connections.length})</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors"
        >
          + Add Connection
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddConnection} className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Contact name" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder="Company name" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <input value={addDomain} onChange={(e) => setAddDomain(e.target.value)} placeholder="company.com" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Job title (optional)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 shrink-0">Relationship strength: <span className="font-bold text-gray-900">{addStrength}/10</span></label>
            <input type="range" min={1} max={10} value={addStrength} onChange={(e) => setAddStrength(Number(e.target.value))} className="flex-1" />
          </div>
          <button type="submit" disabled={addLoading} className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {addLoading ? "Adding…" : "Add Connection"}
          </button>
        </form>
      )}

      {/* Connection list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">No network connections yet.</p>
          <p className="text-gray-400 text-xs mt-1">Add connections to enable warm intro path finding.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.slice(0, 15).map((conn) => (
            <div key={conn.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {conn.contact_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{conn.contact_name}</p>
                <p className="text-xs text-gray-500">{conn.contact_company} · {conn.contact_title ?? "—"}</p>
              </div>
              <div className="shrink-0">
                <StrengthDots strength={conn.relationship_strength} />
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {conn.connection_type.replace(/_/g, " ")}
              </span>
            </div>
          ))}
          {connections.length > 15 && (
            <p className="text-xs text-gray-400 text-center py-2">Showing 15 of {connections.length} connections</p>
          )}
        </div>
      )}
    </div>
  );
}
