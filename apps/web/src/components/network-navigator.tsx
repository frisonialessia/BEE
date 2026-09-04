"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { TONE, heat, tint } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { PageHeader, PageShell } from "@/components/dashboard/page-shell";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyLine, Meter, RowsSkeleton, StateChip, useFittedRows, ViewAllButton, type DotLevel } from "@/features/control/components/primitives";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { useOpportunityDrawer } from "@/features/crm/opportunity-drawer-context";
import { RelationshipMap } from "@/features/network/relationship-map";
import { useCompanies } from "@/hooks/queries/use-companies";
import { addNetworkConnection, findIntroPaths, getNetworkConnections, getNetworkStats } from "@/lib/api";
import type { IntroPath, NetworkConnection, NetworkQueryResult, NetworkStats } from "@/lib/types";

/** One hue for everything that measures a relationship on this page:
 *  indigo, at an intensity that says how strong. */
const HUE = TONE.forecast;

const COVERAGE_LEVEL: Record<NetworkQueryResult["network_coverage"], DotLevel> = {
  strong: 100,
  moderate: 70,
  weak: 45,
  none: "rest",
};

const INTRO_TYPE_LEVEL: Record<string, DotLevel> = {
  warm_intro: 100,
  referral: 70,
  alumni: 45,
  cold: "rest",
};

/** Strength a person picks when adding a contact: four pills, four real
 *  values on the 1–10 scale the API stores. */
const STRENGTH_STEPS = [
  { key: "weak", value: 3 },
  { key: "medium", value: 5 },
  { key: "strong", value: 7 },
  { key: "veryStrong", value: 9 },
] as const;

/** A relationship of 8 or more is one you can lean on for an intro. */
const STRONG_MIN = 8;

/** Row height contract with useFittedRows: two lines + padding. */
const ROW_PX = 57;

/** "acme.com", "www.acme.com" and "https://acme.com/" are the same account. */
function normalizeDomain(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
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
      {copied ? t("copied") : t("copyAsk")}
    </button>
  );
}

/** One path, one row: how warm · who → who → who · strength · hops · copy
 *  the ask. The draft IS the action. */
function PathRow({ path }: { path: IntroPath }) {
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const introType = path.intro_type in INTRO_TYPE_LEVEL ? path.intro_type : "cold";

  return (
    <li className="bee-row flex-wrap justify-between sm:flex-nowrap">
      <StateChip hue={HUE} level={INTRO_TYPE_LEVEL[introType]}>
        {t(`introType.${introType}` as "introType.cold")}
      </StateChip>
      <p className="min-w-0 flex-1 basis-40 truncate text-sm" title={path.steps.map((s) => s.person).join(" → ")}>
        {path.steps.map((step, i) => (
          <span key={i}>
            {i > 0 && <span className="text-[var(--color-text-muted)]"> → </span>}
            <span className="font-medium">{step.person}</span>
          </span>
        ))}
      </p>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">
          {path.strength_score.toFixed(1)}
          <span className="font-normal text-[var(--color-text-muted)]">/10</span>
        </span>
        <span className="block bee-micro">{path.path_length === 1 ? t("direct") : t("hops", { count: path.path_length })}</span>
      </span>
      {path.draft_ask && <CopyAskButton text={path.draft_ask} />}
    </li>
  );
}

export function NetworkNavigatorPanel() {
  const tNav = useTranslations("nav.items");
  const tPage = useTranslations("probarNetworkBrandControl.network");
  const t = useTranslations("probarNetworkBrandControl.network.panel");
  const { openNew } = useOpportunityDrawer();
  const { data: companiesResult } = useCompanies(300);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Path finder state
  const [targetDomain, setTargetDomain] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [pathResult, setPathResult] = useState<NetworkQueryResult | null>(null);
  const [pathLoading, setPathLoading] = useState(false);

  // Add connection state
  const [addName, setAddName] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addStrength, setAddStrength] = useState(7);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [connsResult, statsResult] = await Promise.all([getNetworkConnections(), getNetworkStats()]);
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
      const result = await findIntroPaths({ target_domain: domain, target_company: company || undefined });
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
      const [connsResult, statsResult] = await Promise.all([getNetworkConnections(), getNetworkStats()]);
      setConnections(connsResult.data);
      setStats(statsResult.data);
      resetAddForm();
    } finally {
      setAddLoading(false);
    }
  }

  function resetAddForm() {
    setAddName("");
    setAddCompany("");
    setAddDomain("");
    setAddTitle("");
    setAddStrength(7);
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

  const strongest = useMemo(() => [...connections].sort((a, b) => b.relationship_strength - a.relationship_strength), [connections]);
  const strongCount = connections.filter((c) => c.relationship_strength >= STRONG_MIN).length;
  const selected = connections.find((c) => c.id === selectedId) ?? null;
  const [connectorsRef, connectorRows, connectorsFit] = useFittedRows(strongest, ROW_PX);

  const header = <PageHeader eyebrow={tPage("eyebrow")} title={tNav("network")} caption={tPage("caption")} actions={<LiveBadge live={live} />} />;

  if (loading) {
    return (
      <PageShell header={header}>
        <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
          ))}
        </div>
        <Skeleton className="mt-6 h-96 rounded-[var(--radius-lg)]" />
      </PageShell>
    );
  }

  return (
    <PageShell
      header={header}
      kpis={
        <StatStrip cols={4}>
          <StatTile label={t("stats.totalConnections")} value={stats?.total_connections ?? connections.length} hint={t("stats.firstDegreeHint", { count: stats?.first_degree_count ?? 0 })} tone={TONE.forecast} />
          <StatTile label={t("stats.strong")} value={strongCount} hint={t("stats.strongHint", { min: STRONG_MIN })} progress={connections.length ? strongCount / connections.length : undefined} tone={TONE.market} />
          <StatTile label={t("stats.companiesCovered")} value={stats?.companies_covered ?? new Set(connections.map((c) => c.contact_domain)).size} hint={t("stats.companiesHint")} tone={TONE.prepared} />
          <StatTile
            label={t("stats.avgStrength")}
            value={stats ? `${stats.avg_relationship_strength}/10` : "—"}
            hint={t("stats.avgStrengthHint")}
            progress={stats ? stats.avg_relationship_strength / 10 : undefined}
            tone={TONE.urgency}
          />
        </StatStrip>
      }
    >
      <div className="bee-overview">
        {/* The map: who is close, who is far, grouped by company. */}
        <OverviewCard span={8} title={t("map.title")} caption={t("map.caption")} className="lg:min-h-[26rem]!">
          {connections.length === 0 ? (
            <EmptyLine>{t("empty.title")}</EmptyLine>
          ) : (
            <>
              <RelationshipMap connections={connections} selectedId={selectedId} onSelect={setSelectedId} youLabel={t("map.you")} />
              <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-divider)] pt-3">
                {selected ? (
                  <>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-medium">{selected.contact_name}</p>
                      <p className="truncate bee-micro">
                        {selected.contact_company}
                        {selected.contact_title ? ` · ${selected.contact_title}` : ""}
                        {selected.interaction_count > 0 ? ` · ${t("interactions", { count: selected.interaction_count })}` : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-2" title={t("strengthTitle")}>
                      <Meter value={selected.relationship_strength / 10} hue={HUE} className="w-20" />
                      <span className="bee-caption tabular-nums">{selected.relationship_strength}/10</span>
                    </span>
                    <button type="button" onClick={() => requestIntro(selected)} className="bee-btn-ghost text-xs" title={t("requestIntroTitle", { company: selected.contact_company })}>
                      {t("requestIntro")}
                    </button>
                  </>
                ) : (
                  <p className="bee-caption">{t("map.selectHint")}</p>
                )}
              </div>
            </>
          )}
        </OverviewCard>

        {/* The strongest connectors, one bar each. */}
        <OverviewCard span={4} title={t("connectors.title")} caption={t("connectors.caption")} className="lg:min-h-[26rem]!">
          {strongest.length === 0 ? (
            <EmptyLine>{t("empty.hint")}</EmptyLine>
          ) : (
            <>
              <ul ref={connectorsRef} className="bee-fill min-h-0">
                {connectorRows.map((conn) => (
                  <li key={conn.id} className="bee-row">
                    <button
                      type="button"
                      onClick={() => setSelectedId(conn.id === selectedId ? null : conn.id)}
                      aria-pressed={conn.id === selectedId}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-sm)] text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${conn.id === selectedId ? "font-semibold" : "font-medium"}`}>{conn.contact_name}</span>
                        <span className="block truncate bee-micro">{conn.contact_company}</span>
                      </span>
                      <span className="flex w-24 shrink-0 flex-col items-end gap-1" title={t("strengthTitle")}>
                        <Meter value={conn.relationship_strength / 10} hue={HUE} color={heat(HUE, conn.relationship_strength / 10)} className="w-full" />
                        <span className="bee-micro tabular-nums">{conn.relationship_strength}/10</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <ViewAllButton hidden={connectorsFit.hidden} expanded={connectorsFit.expanded} onToggle={connectorsFit.toggle} />
            </>
          )}
        </OverviewCard>

        {/* Path finder — the question this page answers. */}
        <OverviewCard span={7} title={t("pathFinderTitle")} caption={t("pathFinderCaption")}>
          <form onSubmit={handleFindPaths} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label={t("form.targetDomainLabel")} required>
              <input value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)} placeholder={t("targetDomainPlaceholder")} className="bee-input" required />
            </Field>
            <Field label={t("form.targetCompanyLabel")}>
              <input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder={t("targetCompanyPlaceholder")} className="bee-input" />
            </Field>
            <button type="submit" disabled={pathLoading} className="bee-btn bee-btn--primary">
              {pathLoading ? t("searching") : t("findPaths")}
            </button>
          </form>

          {pathLoading ? (
            <div className="mt-3">
              <RowsSkeleton rows={2} />
            </div>
          ) : pathResult ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {pathResult.paths_found.length > 0 ? t("pathsFound", { count: pathResult.paths_found.length, company: pathResult.target_company }) : t("noPathsFound", { company: pathResult.target_company })}
                </p>
                {pathResult.network_coverage && (
                  <StateChip hue={HUE} level={COVERAGE_LEVEL[pathResult.network_coverage]}>
                    {t("coverageLabel", { coverage: t(`coverage.${pathResult.network_coverage}` as "coverage.none") })}
                  </StateChip>
                )}
              </div>
              {pathResult.cold_outreach_fallback && <p className="mt-2 bee-caption">{t("coldOutreachFallback")}</p>}
              {pathResult.paths_found.length > 0 && (
                <ul className="mt-1">
                  {pathResult.paths_found.map((path, i) => (
                    <PathRow key={i} path={path} />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <EmptyLine>{t("pathFinderHint")}</EmptyLine>
          )}
        </OverviewCard>

        {/* Add a contact — the same language as every BEE form. */}
        <OverviewCard span={5} title={t("addConnection")} caption={t("form.caption")}>
          <form onSubmit={handleAddConnection} className="bee-fill flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("form.contactNameLabel")} required>
                <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("form.contactNamePlaceholder")} required className="bee-input" />
              </Field>
              <Field label={t("form.titleLabel")}>
                <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder={t("form.titlePlaceholder")} className="bee-input" />
              </Field>
              <Field label={t("form.companyNameLabel")} required>
                <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder={t("form.companyNamePlaceholder")} required className="bee-input" />
              </Field>
              <Field label={t("form.domainLabel")} required>
                <input value={addDomain} onChange={(e) => setAddDomain(e.target.value)} placeholder={t("form.domainPlaceholder")} required className="bee-input" />
              </Field>
            </div>
            <Field label={t("form.relationshipStrength")} hint={t("form.strengthHint")}>
              <div className="flex flex-wrap gap-1.5">
                {STRENGTH_STEPS.map((step) => (
                  <Pill key={step.key} pressed={addStrength === step.value} fill={tint(HUE, 45)} onClick={() => setAddStrength(step.value)}>
                    {t(`form.strengthLevels.${step.key}`)} · {step.value}
                  </Pill>
                ))}
              </div>
            </Field>
            <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={resetAddForm} className="bee-btn-ghost">
                {t("form.cancel")}
              </button>
              <button type="submit" disabled={addLoading} className="bee-btn bee-btn--primary">
                {addLoading ? t("form.adding") : t("form.submit")}
              </button>
            </div>
          </form>
        </OverviewCard>
      </div>
    </PageShell>
  );
}
