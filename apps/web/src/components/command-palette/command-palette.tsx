"use client";

import { Building2, LogOut, Radio, Search, Sparkles, Target, User as UserIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { useBrainSearch } from "@/hooks/queries/use-brain-search";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { BrainSearchResult } from "@/lib/api/search";
import { NAV_ITEMS } from "@/lib/nav-items";
import { buildSearchIndex, searchIndex, type SearchResult } from "@/lib/search/build-search-index";
import { useAuth } from "@/providers/auth-provider";

const BRAIN_ENTITY_ICON: Record<BrainSearchResult["entity_type"], LucideIcon> = {
  signal: Radio,
  company: Building2,
  opportunity: Target,
};

function brainResultHref(r: BrainSearchResult): string {
  switch (r.entity_type) {
    case "company":
      return `/dashboard/companies/${r.entity_id}`;
    case "opportunity":
      return `/dashboard/opportunities/${r.entity_id}`;
    case "signal":
      return "/dashboard/signals";
  }
}

interface PaletteEntry {
  id: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  groupLabel: string;
  onSelect: () => void;
}

const ENTITY_ICON: Record<SearchResult["kind"], LucideIcon> = {
  company: Building2,
  opportunity: Target,
  contact: UserIcon,
};

/** Command Palette — Cmd/Ctrl+K desde cualquier pantalla: navegar, buscar
 *  empresas/oportunidades/contactos, y acciones rápidas, todo en un solo
 *  cuadro operable desde el teclado. Complementa (no reemplaza) el buscador
 *  del encabezado — este es el atajo de power-user. */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const { logout } = useAuth();
  const t = useTranslations("common.commandPalette");
  const tNav = useTranslations("nav.items");

  const { data: companiesResult } = useCompanies(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: leadsResult } = useLeads(200);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: brainResult, isFetching: brainSearching } = useBrainSearch(debouncedQuery, 6);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Limpiar la búsqueda al abrir: ajustado durante el render (patrón de
  // React para derivar estado de un valor que cambió) en vez de un efecto,
  // para no disparar la regla set-state-in-effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  // Enfocar el input al abrir sí es un efecto real (una acción imperativa
  // sobre el DOM, no un cambio de estado) — este no dispara esa regla.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const searchEntries = useMemo(() => {
    const index = buildSearchIndex({
      companies: companiesResult?.data ?? [],
      opportunities: oppsResult?.data ?? [],
      leads: leadsResult?.data ?? [],
    });
    const q = query.trim();
    if (!q) return [];
    return searchIndex(index, q, 6).map(
      (r): PaletteEntry => ({
        id: `entity-${r.id}`,
        label: r.title,
        sublabel: r.subtitle,
        icon: ENTITY_ICON[r.kind],
        groupLabel: t("groupResults"),
        onSelect: () => router.push(r.href),
      }),
    );
  }, [query, companiesResult?.data, oppsResult?.data, leadsResult?.data, router, t]);

  // "Ask BEE" — cross-entity semantic search (signals, companies,
  // opportunities/strategies) via BrainSearchService, debounced above so a
  // fast typist doesn't fire one backend request per keystroke. Separate
  // group from searchEntries above (which is a plain, instant, client-side
  // substring match over the already-fetched company/opportunity/lead
  // lists) — this one can surface matches those 200-row, exact-substring
  // results miss (semantic overlap, or anything past row 200), including
  // signals, which the client-side index doesn't cover at all.
  const brainEntries = useMemo((): PaletteEntry[] => {
    const results = brainResult?.data ?? [];
    return results.map(
      (r): PaletteEntry => ({
        id: `brain-${r.entity_type}-${r.entity_id}`,
        label: r.title,
        sublabel: r.snippet || undefined,
        icon: BRAIN_ENTITY_ICON[r.entity_type],
        groupLabel: t("groupSmart"),
        onSelect: () => router.push(brainResultHref(r)),
      }),
    );
  }, [brainResult, router, t]);

  const navEntries = useMemo((): PaletteEntry[] => {
    const q = query.trim().toLowerCase();
    return NAV_ITEMS.map((item) => ({ item, label: tNav(item.labelKey) }))
      .filter(({ label }) => !q || label.toLowerCase().includes(q))
      .map(
        ({ item, label }): PaletteEntry => ({
          id: `nav-${item.href}`,
          label,
          icon: item.icon,
          groupLabel: t("groupGoTo"),
          onSelect: () => router.push(item.href),
        }),
      );
  }, [query, router, t, tNav]);

  const actionEntries = useMemo((): PaletteEntry[] => {
    const q = query.trim().toLowerCase();
    const actions: PaletteEntry[] = [
      {
        id: "action-logout",
        label: t("logout"),
        icon: LogOut,
        groupLabel: t("groupActions"),
        onSelect: logout,
      },
    ];
    return actions.filter((a) => !q || a.label.toLowerCase().includes(q));
  }, [query, logout, t]);

  const entries = useMemo(
    () => [...navEntries, ...searchEntries, ...brainEntries, ...actionEntries],
    [navEntries, searchEntries, brainEntries, actionEntries],
  );

  // La lista de resultados cambia con cada tecla — si no reajustamos,
  // activeIndex puede quedar apuntando a una fila que ya no existe.
  // Mismo patrón de "ajustar durante el render" que el de arriba.
  const [prevEntriesLength, setPrevEntriesLength] = useState(entries.length);
  if (entries.length !== prevEntriesLength) {
    setPrevEntriesLength(entries.length);
    setActiveIndex(0);
  }

  function activate(entry: PaletteEntry) {
    entry.onSelect();
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[activeIndex];
      if (entry) activate(entry);
    }
  }

  if (!open) return null;

  let cursor = 0;
  const groups = new Map<string, { entry: PaletteEntry; index: number }[]>();
  for (const entry of entries) {
    const index = cursor++;
    const list = groups.get(entry.groupLabel) ?? [];
    list.push({ entry, index });
    groups.set(entry.groupLabel, list);
  }

  return (
    <>
      <button
        type="button"
        className="bee-drawer-overlay"
        aria-label={t("closeAria")}
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
        className="bee-glass fixed left-1/2 top-24 z-[60] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {brainSearching && debouncedQuery.trim().length >= 3 && (
            <Sparkles className="size-3.5 shrink-0 animate-pulse text-[var(--color-chart-4)]" aria-hidden />
          )}
          <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border px-2 py-1 bee-micro">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {entries.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("noResults")}</p>
          ) : (
            [...groups.entries()].map(([groupLabel, items]) => (
              <div key={groupLabel} className="mb-2 last:mb-0">
                <p className="px-4 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {groupLabel}
                </p>
                {items.map(({ entry, index }) => {
                  const Icon = entry.icon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activate(entry)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        active ? "bg-[var(--color-primary)]/40" : "hover:bg-[var(--color-primary)]/20"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-[var(--color-chart-4)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{entry.label}</p>
                        {entry.sublabel && (
                          <p className="truncate bee-micro">{entry.sublabel}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
