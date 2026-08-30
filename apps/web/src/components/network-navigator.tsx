"use client";

import { useEffect, useState } from "react";
import type { IntroPath, NetworkConnection, NetworkQueryResult, NetworkStats } from "@/lib/types";
import { addNetworkConnection, findIntroPaths, getNetworkConnections, getNetworkStats } from "@/lib/api";

// BEE has no green/blue/purple scales of its own — success maps to
// var(--success) (chart-5, magenta), caution to var(--warning) (chart-1,
// amber), and "informational" states reuse chart-4 (the palette's blue) and
// chart-6 (violet) directly, since those already exist as brand accents.
const COVERAGE_CONFIG: Record<string, { label: string; varColor: string }> = {
  none: { label: "Sin cobertura", varColor: "var(--color-text-muted)" },
  weak: { label: "Débil", varColor: "var(--warning)" },
  moderate: { label: "Moderada", varColor: "var(--color-chart-4)" },
  strong: { label: "Fuerte", varColor: "var(--success)" },
};

const INTRO_TYPE_CONFIG: Record<string, { label: string; varColor: string | null }> = {
  warm_intro: { label: "Presentación cálida", varColor: "var(--success)" },
  referral: { label: "Referido", varColor: "var(--color-chart-4)" },
  alumni: { label: "Exalumno", varColor: "var(--color-chart-6)" },
  cold: { label: "Frío", varColor: null },
};

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span className="flex gap-0.5">
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
  const [showDraft, setShowDraft] = useState(false);
  const introType = INTRO_TYPE_CONFIG[path.intro_type] ?? INTRO_TYPE_CONFIG.cold;

  return (
    <div className="bee-bento bee-bento-pad space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs px-2 py-0.5 rounded-sm border font-medium"
          style={
            introType.varColor
              ? {
                  color: introType.varColor,
                  borderColor: introType.varColor,
                  background: `color-mix(in srgb, ${introType.varColor} 15%, var(--color-background))`,
                }
              : { color: "var(--color-text-muted)", borderColor: "var(--color-divider)", background: "var(--color-primary)" }
          }
        >
          {introType.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {path.path_length === 1 ? "Directo" : `${path.path_length} saltos`} · {path.strength_score.toFixed(1)}/10
        </span>
      </div>

      {/* Path visualization */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        {path.steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="bg-[var(--color-primary)] rounded-md px-2 py-0.5 font-medium">{step.person}</span>
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
            {showDraft ? "Ocultar" : "Ver"} borrador de solicitud de presentación
          </button>
          {showDraft && (
            <div className="mt-2 p-3 rounded-sm border border-[var(--color-chart-4)]/25 bg-[color-mix(in_srgb,var(--color-chart-4)_10%,var(--color-background))]">
              <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{path.draft_ask}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(path.draft_ask ?? "")}
                className="mt-2 text-xs font-medium text-[var(--color-chart-4)] hover:underline"
              >
                Copiar al portapapeles
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
            { label: "Conexiones totales", value: stats.total_connections },
            { label: "1er grado", value: stats.first_degree_count },
            { label: "Empresas cubiertas", value: stats.companies_covered },
            { label: "Fuerza promedio", value: `${stats.avg_relationship_strength}/10` },
          ].map(({ label, value }) => (
            <div key={label} className="bee-bento p-3 text-center">
              <p className="bee-stat__val">{value}</p>
              <p className="bee-stat__lbl">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Path finder */}
      <div className="bee-bento bee-bento-pad space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Buscar ruta de presentación</h3>
        <form onSubmit={handleFindPaths} className="flex flex-wrap gap-2">
          <input
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder="empresa-objetivo.com"
            className="flex-1 min-w-40 rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
            required
          />
          <input
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder="Nombre de la empresa (opcional)"
            className="flex-1 min-w-40 rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          <button type="submit" disabled={pathLoading} className="bee-btn bee-btn--primary">
            {pathLoading ? "Buscando…" : "Buscar rutas"}
          </button>
        </form>

        {/* Path results */}
        {pathResult && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {pathResult.paths_found.length > 0
                  ? `${pathResult.paths_found.length} ruta(s) encontrada(s) hacia ${pathResult.target_company}`
                  : `No se encontraron rutas de red hacia ${pathResult.target_company}`}
              </p>
              {pathResult.network_coverage && (
                <span className="text-xs font-medium" style={{ color: COVERAGE_CONFIG[pathResult.network_coverage]?.varColor }}>
                  Cobertura: {COVERAGE_CONFIG[pathResult.network_coverage]?.label}
                </span>
              )}
            </div>

            {pathResult.cold_outreach_fallback && (
              <div className="rounded-sm border p-3 text-xs" style={{ borderColor: "var(--color-chart-1)", background: "color-mix(in srgb, var(--color-chart-1) 15%, var(--color-background))", color: "var(--color-text)" }}>
                No se encontraron presentaciones cálidas. Usa las señales del Dark Funnel para personalizar el contacto en frío.
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
        <h3 className="text-sm font-semibold text-foreground">Conexiones de red ({connections.length})</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bee-btn-ghost bee-btn-ghost--dashed"
        >
          + Agregar conexión
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddConnection} className="rounded-lg border border-dashed border-border bg-[var(--color-primary)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Nombre del contacto" required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder="Nombre de la empresa" required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addDomain} onChange={(e) => setAddDomain(e.target.value)} placeholder="empresa.com" required className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
            <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Cargo (opcional)" className="rounded-sm border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground shrink-0">Fuerza de la relación: <span className="font-bold text-foreground">{addStrength}/10</span></label>
            <input type="range" min={1} max={10} value={addStrength} onChange={(e) => setAddStrength(Number(e.target.value))} className="flex-1" />
          </div>
          <button type="submit" disabled={addLoading} className="bee-btn bee-btn--primary">
            {addLoading ? "Agregando…" : "Agregar conexión"}
          </button>
        </form>
      )}

      {/* Connection list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-[var(--color-primary)] animate-pulse" />)}
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground text-sm">No network connections yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Add connections to enable warm intro path finding.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.slice(0, 15).map((conn) => (
            <div key={conn.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-[var(--color-card)] hover:border-border transition-colors">
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
            <p className="text-xs text-muted-foreground text-center py-2">Showing 15 of {connections.length} connections</p>
          )}
        </div>
      )}
    </div>
  );
}
