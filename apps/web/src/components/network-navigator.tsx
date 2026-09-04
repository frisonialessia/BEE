"use client";

import { Check, Copy, Handshake } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Donut } from "@/components/charts/donut";
import { DATA, mix } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { useCompanies } from "@/hooks/queries/use-companies";
import { addNetworkConnection, findIntroPaths, getNetworkConnections, getNetworkStats } from "@/lib/api";
import type { IntroPath, NetworkConnection, NetworkQueryResult, NetworkStats } from "@/lib/types";

/** One hue for everything that measures a relationship on this page:
 *  indigo, at a strength that says how strong. Coverage and intro type are
 *  the same hue at four steps — never a second color for "better". */
const HUE = DATA.indigo;

const COVERAGE_STRENGTH: Record<NetworkQueryResult["network_coverage"], number> = {
  none: 12,
  weak: 30,
  moderate: 60,
  strong: 100,
};

const INTRO_TYPE_STRENGTH: Record<string, number> = {
  warm_intro: 100,
  referral: 65,
  alumni: 45,
  cold: 20,
};

/** "acme.com", "www.acme.com" and "https://acme.com/" are the same account. */
function normalizeDomain(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Thin 0–1 meter in the page hue on a faint track of the same hue. */
function StrengthMeter({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${className}`} style={{ background: mix(HUE, 12) }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: HUE }} />
    </div>
  );
}

/** Copies the prepared intro request — the one thing a seller does with a
 *  path. Flips to "Copiado" for two seconds so the click has a visible result. */
function CopyAskButton({ text }: { text: string }) {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
      }}
      className="bee-btn-ghost shrink-0 text-xs"
      title={t("copyAskTitle")}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? t("copied") : t("copyAsk")}
    </button>
  );
}

/** One path, one line: how warm · who → who → who · strength · hops · copy
 *  the ask. The recommendation paragraph is gone — the draft IS the action. */
function PathRow({ path }: { path: IntroPath }) {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const introType = path.intro_type in INTRO_TYPE_STRENGTH ? path.intro_type : "cold";
  const strength = INTRO_TYPE_STRENGTH[introType];

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5">
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: mix(HUE, Math.max(12, Math.round(strength * 0.3))) }}
      >
        <span className="size-1.5 rounded-full" style={{ background: mix(HUE, strength) }} />
        {t(`introType.${introType}` as "introType.cold")}
      </span>
      <p className="min-w-0 truncate text-sm" title={path.steps.map((s) => s.person).join(" → ")}>
        {path.steps.map((step, i) => (
          <span key={i}>
            {i > 0 && <span className="text-muted-foreground"> → </span>}
            <span className="font-medium">{step.person}</span>
          </span>
        ))}
      </p>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">{path.strength_score.toFixed(1)}<span className="font-normal text-muted-foreground">/10</span></span>
        <span className="block bee-micro">{path.path_length === 1 ? t("direct") : t("hops", { count: path.path_length })}</span>
      </span>
      {path.draft_ask ? <CopyAskButton text={path.draft_ask} /> : <span className="w-0" aria-hidden />}
    </li>
  );
}

export function NetworkNavigatorPanel() {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const { openNew } = useOpportunityDrawer();
  const { data: companiesResult } = useCompanies(300);
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

  async function runPathSearch(domain: string, company: string) {
    setPathLoading(true);
    try {
      const result = await findIntroPaths({
        target_domain: domain,
        target_company: company || undefined,
      });
      setPathResult(result.data);
    } finally {
      setPathLoading(false);
    }
  }

  async function handleFindPaths(e: React.FormEvent) {
    e.preventDefault();
    if (!targetDomain.trim()) return;
    await runPathSearch(targetDomain.trim(), targetCompany.trim());
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

  /** "Pedir intro" — when the contact's company is already an account in
   *  BEE, open the drawer's create flow pinned to it (the opportunity gets
   *  created where the intro will be worked). Otherwise the account isn't
   *  known yet: run the path finder for that domain right here, so the
   *  seller gets the paths and the ask without re-typing anything. */
  function requestIntro(conn: NetworkConnection) {
    const domain = normalizeDomain(conn.contact_domain);
    const company = (companiesResult?.data ?? []).find((c) => normalizeDomain(c.domain) === domain);
    if (company) {
      openNew({ companyId: company.id });
      return;
    }
    setTargetDomain(conn.contact_domain);
    setTargetCompany(conn.contact_company);
    void runPathSearch(conn.contact_domain, conn.contact_company);
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
                  <span key={ind} className="rounded-full px-2 py-0.5 bee-micro text-[var(--color-text)]" style={{ background: mix(HUE, 16) }}>
                    {ind}
                  </span>
                ))}
              </div>
            )}
          </OverviewCard>
        )}

      {/* Path finder */}
      <OverviewCard span={stats ? 8 : 12} title={t("pathFinderTitle")} caption={t("pathFinderCaption")} className="space-y-3">
        <form onSubmit={handleFindPaths} className="flex flex-wrap gap-2">
          <input
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder={t("targetDomainPlaceholder")}
            className="bee-input min-w-40 flex-1"
            required
          />
          <input
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder={t("targetCompanyPlaceholder")}
            className="bee-input min-w-40 flex-1"
          />
          <button type="submit" disabled={pathLoading} className="bee-btn bee-btn--primary">
            {pathLoading ? t("searching") : t("findPaths")}
          </button>
        </form>

        {/* Path results — compact rows, one action each */}
        {pathResult && (
          <div className="pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {pathResult.paths_found.length > 0
                  ? t("pathsFound", { count: pathResult.paths_found.length, company: pathResult.target_company })
                  : t("noPathsFound", { company: pathResult.target_company })}
              </p>
              {pathResult.network_coverage && (
                <span className="inline-flex items-center gap-2 text-xs font-medium">
                  <StrengthMeter value={COVERAGE_STRENGTH[pathResult.network_coverage] / 100} className="w-16" />
                  {t("coverageLabel", { coverage: t(`coverage.${pathResult.network_coverage}` as "coverage.none") })}
                </span>
              )}
            </div>

            {pathResult.cold_outreach_fallback && (
              <p className="mt-2 bee-caption">{t("coldOutreachFallback")}</p>
            )}

            {pathResult.paths_found.length > 0 && (
              <ul className="mt-1 divide-y divide-border">
                {pathResult.paths_found.map((path, i) => (
                  <PathRow key={i} path={path} />
                ))}
              </ul>
            )}
          </div>
        )}
      </OverviewCard>
      </div>

      {/* Add connection */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="bee-card-title !mb-0">{t("connectionsTitle", { count: connections.length })}</h3>
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
        <form onSubmit={handleAddConnection} className="space-y-3 rounded-lg border border-dashed border-border p-4" style={{ background: mix(HUE, 6) }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("form.contactNamePlaceholder")} required className="bee-input" />
            <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder={t("form.companyNamePlaceholder")} required className="bee-input" />
            <input value={addDomain} onChange={(e) => setAddDomain(e.target.value)} placeholder={t("form.domainPlaceholder")} required className="bee-input" />
            <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={t("form.titlePlaceholder")} className="bee-input" />
          </div>
          <div className="flex items-center gap-4">
            <label className="shrink-0 text-xs text-muted-foreground">{t("form.relationshipStrength")} <span className="text-sm font-bold tabular-nums text-foreground">{addStrength}/10</span></label>
            <input type="range" min={1} max={10} value={addStrength} onChange={(e) => setAddStrength(Number(e.target.value))} className="flex-1 accent-[var(--color-chart-4)]" />
          </div>
          <button type="submit" disabled={addLoading} className="bee-btn bee-btn--primary">
            {addLoading ? t("form.adding") : t("form.submit")}
          </button>
        </form>
      )}

      {/* Connection list — one line per person, one action */}
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
        <ul className="bee-bento divide-y divide-border">
          {connections.slice(0, 15).map((conn) => (
            <li key={conn.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm text-xs font-bold" style={{ background: mix(HUE, 18) }}>
                {conn.contact_name.slice(0, 2).toUpperCase()}
              </span>
              <p className="min-w-0 truncate text-sm" title={`${conn.contact_name} · ${conn.contact_company}${conn.contact_title ? ` · ${conn.contact_title}` : ""}`}>
                <span className="font-medium">{conn.contact_name}</span>
                <span className="text-muted-foreground"> · {conn.contact_company}{conn.contact_title ? ` · ${conn.contact_title}` : ""}</span>
              </p>
              <span className="hidden w-32 items-center gap-2 sm:flex" title={t("strengthTitle")}>
                <StrengthMeter value={conn.relationship_strength / 10} className="flex-1" />
                <span className="shrink-0 text-sm font-bold tabular-nums">{conn.relationship_strength}<span className="font-normal text-muted-foreground">/10</span></span>
              </span>
              <button type="button" onClick={() => requestIntro(conn)} className="bee-btn-ghost text-xs" title={t("requestIntroTitle", { company: conn.contact_company })}>
                <Handshake className="size-3.5" aria-hidden />
                {t("requestIntro")}
              </button>
            </li>
          ))}
          {connections.length > 15 && (
            <li className="px-4 py-2 text-center bee-micro">{t("showingOf", { count: connections.length })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
