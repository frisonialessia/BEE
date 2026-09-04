"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { IntroPath, NetworkConnection, NetworkQueryResult, NetworkStats } from "@/lib/types";
import { addNetworkConnection, findIntroPaths, getNetworkConnections, getNetworkStats } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveBadge } from "@/components/live-badge";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Donut } from "@/components/charts/donut";
import { DATA } from "@/components/charts/palette";

// BEE has no green/blue/purple scales of its own — success maps to
// var(--success) (chart-5, magenta), caution to var(--warning) (chart-1,
// amber), and "informational" states reuse chart-4 (the palette's blue) and
// chart-6 (violet) directly, since those already exist as brand accents.
const COVERAGE_VAR: Record<string, string> = {
  none: "var(--color-text-muted)",
  weak: "var(--warning)",
  moderate: "var(--color-chart-4)",
  strong: "var(--success)",
};

const INTRO_TYPE_VAR: Record<string, string | null> = {
  warm_intro: "var(--success)",
  referral: "var(--color-chart-4)",
  alumni: "var(--color-chart-6)",
  cold: null,
};

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span className="flex gap-1">
      {[...Array(10)].map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-sm"
          style={{ background: i < strength ? "var(--success)" : "var(--color-divider)" }}
        />
      ))}
    </span>
  );
}

function PathCard({ path }: { path: IntroPath }) {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const [showDraft, setShowDraft] = useState(false);
  const introType = path.intro_type in INTRO_TYPE_VAR ? path.intro_type : "cold";
  const introVarColor = INTRO_TYPE_VAR[introType];

  return (
    <div className="bee-bento bee-bento-pad space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs px-2 py-1 rounded-sm border font-medium"
          style={
            introVarColor
              ? {
                  color: introVarColor,
                  borderColor: introVarColor,
                  background: `color-mix(in srgb, ${introVarColor} 15%, var(--color-background))`,
                }
              : { color: "var(--color-text-muted)", borderColor: "var(--color-divider)", background: "var(--color-primary)" }
          }
        >
          {t(`introType.${introType}` as "introType.cold")}
        </span>
        <span className="text-xs text-muted-foreground">
          {path.path_length === 1 ? t("direct") : t("hops", { count: path.path_length })} · {path.strength_score.toFixed(1)}/10
        </span>
      </div>

      {/* Path visualization */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        {path.steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="bg-[var(--color-primary)] rounded-md px-2 py-1 font-medium">{step.person}</span>
            {i < path.steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </span>
        ))}
      </div>

      <p className="text-xs text-foreground">{path.action_recommendation}</p>

      {path.draft_ask && (
        <div>
          <button
            onClick={() => setShowDraft((v) => !v)}
            className="text-xs font-medium text-[var(--color-chart-4)] hover:underline underline-offset-2"
          >
            {showDraft ? t("hideDraft") : t("showDraft")}
          </button>
          {showDraft && (
            <div className="mt-2 p-3 rounded-sm border border-[var(--color-chart-4)]/25 bg-[color-mix(in_srgb,var(--color-chart-4)_10%,var(--color-background))]">
              <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{path.draft_ask}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(path.draft_ask ?? "")}
                className="mt-2 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
              >
                {t("copyToClipboard")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NetworkNavigatorPanel() {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

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
      setLive(connsResult.live || statsResult.live);
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
        <StatStrip cols={4}>
          <StatTile label={t("stats.totalConnections")} value={stats.total_connections} tone={DATA.indigo} />
          <StatTile label={t("stats.firstDegree")} value={stats.first_degree_count} tone={DATA.honey} progress={stats.total_connections ? stats.first_degree_count / stats.total_connections : undefined} />
          <StatTile label={t("stats.companiesCovered")} value={stats.companies_covered} tone={DATA.magenta} />
          <StatTile label={t("stats.avgStrength")} value={`${stats.avg_relationship_strength}/10`} tone={DATA.violet} progress={stats.avg_relationship_strength / 10} />
        </StatStrip>
      )}

      <div className="bee-overview">
        {stats && (
          <OverviewCard span={4} title={t("degreeTitle")} caption={t("degreeCaption")}>
            <Donut
              slices={[
                { label: t("stats.firstDegree"), value: stats.first_degree_count, color: DATA.indigo },
                { label: t("stats.secondDegree"), value: stats.second_degree_count, color: DATA.violet },
                { label: t("stats.further"), value: Math.max(0, stats.total_connections - stats.first_degree_count - stats.second_degree_count), color: DATA.lavender },
              ]}
            />
            {stats.top_industries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stats.top_industries.slice(0, 4).map((ind) => (
                  <span key={ind} className="rounded-full bg-[color-mix(in_srgb,var(--color-chart-4)_16%,var(--color-card))] px-2 py-0.5 bee-micro text-[var(--color-text)]">
                    {ind}
                  </span>
                ))}
              </div>
            )}
          </OverviewCard>
        )}

      {/* Path finder */}
      <OverviewCard span={stats ? 8 : 12} title={t("pathFinderTitle")} className="space-y-3">
        <form onSubmit={handleFindPaths} className="flex flex-wrap gap-2">
          <input
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder={t("targetDomainPlaceholder")}
            className="flex-1 min-w-40 rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            required
          />
          <input
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder={t("targetCompanyPlaceholder")}
            className="flex-1 min-w-40 rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          <button type="submit" disabled={pathLoading} className="bee-btn bee-btn--primary">
            {pathLoading ? t("searching") : t("findPaths")}
          </button>
        </form>

        {/* Path results */}
        {pathResult && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {pathResult.paths_found.length > 0
                  ? t("pathsFound", { count: pathResult.paths_found.length, company: pathResult.target_company })
                  : t("noPathsFound", { company: pathResult.target_company })}
              </p>
              {pathResult.network_coverage && (
                <span className="text-xs font-medium" style={{ color: COVERAGE_VAR[pathResult.network_coverage] }}>
                  {t("coverageLabel", { coverage: t(`coverage.${pathResult.network_coverage}` as "coverage.none") })}
                </span>
              )}
            </div>

            {pathResult.cold_outreach_fallback && (
              <div className="rounded-sm border p-3 text-xs" style={{ borderColor: "var(--color-chart-1)", background: "color-mix(in srgb, var(--color-chart-1) 15%, var(--color-background))", color: "var(--color-text)" }}>
                {t("coldOutreachFallback")}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pathResult.paths_found.map((path, i) => (
                <PathCard key={i} path={path} />
              ))}
            </div>
          </div>
        )}
      </OverviewCard>
      </div>

      {/* Add connection */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="bee-card-title">{t("connectionsTitle", { count: connections.length })}</h3>
        <div className="flex items-center gap-2">
          <LiveBadge live={live} />
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="bee-btn-ghost bee-btn-ghost--dashed"
          >
            {t("addConnection")}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAddConnection} className="rounded-lg border border-dashed border-border bg-[var(--color-primary)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("form.contactNamePlaceholder")} required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder={t("form.companyNamePlaceholder")} required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addDomain} onChange={(e) => setAddDomain(e.target.value)} placeholder={t("form.domainPlaceholder")} required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={t("form.titlePlaceholder")} className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs text-muted-foreground shrink-0">{t("form.relationshipStrength")} <span className="font-bold text-foreground">{addStrength}/10</span></label>
            <input type="range" min={1} max={10} value={addStrength} onChange={(e) => setAddStrength(Number(e.target.value))} className="flex-1 accent-[var(--color-chart-4)]" />
          </div>
          <button type="submit" disabled={addLoading} className="bee-btn bee-btn--primary">
            {addLoading ? t("form.adding") : t("form.submit")}
          </button>
        </form>
      )}

      {/* Connection list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : connections.length === 0 ? (
        <div className="bee-bento bee-bento-pad py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
          <p className="bee-caption mt-1">{t("empty.hint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.slice(0, 15).map((conn) => (
            <div key={conn.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-[var(--color-card)] hover:border-border transition-colors">
              <div className="w-8 h-8 rounded-sm bg-[var(--color-primary)] flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                {conn.contact_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{conn.contact_name}</p>
                <p className="text-xs text-muted-foreground">{conn.contact_company} · {conn.contact_title ?? "—"}</p>
              </div>
              <div className="shrink-0">
                <StrengthDots strength={conn.relationship_strength} />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {conn.connection_type.replace(/_/g, " ")}
              </span>
            </div>
          ))}
          {connections.length > 15 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t("showingOf", { count: connections.length })}</p>
          )}
        </div>
      )}
    </div>
  );
}
