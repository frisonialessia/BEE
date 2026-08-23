"use client";

import { Building2, Search, Target, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { buildSearchIndex, searchIndex, type SearchResult } from "@/lib/search/build-search-index";

const KIND_ICON: Record<SearchResult["kind"], typeof Building2> = {
  company: Building2,
  opportunity: Target,
  contact: User,
};

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  company: "Empresa",
  opportunity: "Oportunidad",
  contact: "Contacto",
};

/** Búsqueda global — empresas, oportunidades y contactos, todo desde un solo campo. */
export function GlobalSearch() {
  const { data: companiesResult } = useCompanies(200);
  const { data: oppsResult } = useOpportunities(undefined, 200);
  const { data: leadsResult } = useLeads(200);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () =>
      buildSearchIndex({
        companies: companiesResult?.data ?? [],
        opportunities: oppsResult?.data ?? [],
        leads: leadsResult?.data ?? [],
      }),
    [companiesResult?.data, oppsResult?.data, leadsResult?.data],
  );

  const results = useMemo(() => searchIndex(index, query), [index, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-border bg-[var(--color-card)]/60 px-3 py-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar empresas, oportunidades, contactos…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && query.trim() && (
        <div className="bee-glass absolute left-0 top-full z-50 mt-2 max-h-96 w-full min-w-[20rem] overflow-y-auto rounded-[var(--radius-lg)]">
          {results.length === 0 ? (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground">
              Sin resultados para &quot;{query}&quot;.
            </p>
          ) : (
            <ul>
              {results.map((r) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li key={r.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={r.href}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--color-primary)]/30"
                    >
                      <Icon className="size-4 shrink-0 text-[var(--color-chart-4)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{r.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{r.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {KIND_LABEL[r.kind]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
