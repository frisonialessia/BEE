"use client";

import { useState } from "react";

import { useUpdateIcpCriteria } from "@/hooks/queries/use-icp";
import type { IcpCriteria } from "@/lib/api/organizations";

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Formulario del Perfil de Cliente Ideal — tres listas separadas por coma.
 *  Una dimensión vacía significa "no me importa", no "nada califica" (ver
 *  lib/icp.ts computeFitScore). */
export function IcpSettingsForm({
  initial,
  suggestions,
  onDone,
}: {
  initial: IcpCriteria;
  suggestions: { industries: string[]; sizes: string[]; countries: string[] };
  onDone: () => void;
}) {
  const updateIcp = useUpdateIcpCriteria();
  const [industries, setIndustries] = useState(toCsv(initial.industries));
  const [sizes, setSizes] = useState(toCsv(initial.sizes));
  const [countries, setCountries] = useState(toCsv(initial.countries));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateIcp.mutateAsync({
      industries: fromCsv(industries),
      sizes: fromCsv(sizes),
      countries: fromCsv(countries),
    });
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Perfil de Cliente Ideal (ICP)
      </p>
      <p className="bee-caption mb-3">
        Separa cada valor con comas. Deja una lista vacía si esa dimensión no te importa — no penaliza a nadie.
      </p>

      <div className="space-y-2.5">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Industrias</label>
          <input
            value={industries}
            onChange={(e) => setIndustries(e.target.value)}
            placeholder="SaaS, Fintech, Logística…"
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.industries.length > 0 && (
            <p className="mt-1 bee-micro">
              Ya usas: {suggestions.industries.join(", ")}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tamaños de empresa</label>
          <input
            value={sizes}
            onChange={(e) => setSizes(e.target.value)}
            placeholder="11-50, 51-200…"
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.sizes.length > 0 && (
            <p className="mt-1 bee-micro">Ya usas: {suggestions.sizes.join(", ")}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Países</label>
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder="México, Colombia…"
            className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          />
          {suggestions.countries.length > 0 && (
            <p className="mt-1 bee-micro">
              Ya usas: {suggestions.countries.join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={updateIcp.isPending} className="bee-btn bee-btn--primary">
          {updateIcp.isPending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}
