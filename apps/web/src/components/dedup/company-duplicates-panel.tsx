"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { useCompanyDuplicates, useMergeCompanies } from "@/hooks/queries/use-companies";
import type { Company } from "@/types/domain";

const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

function GroupRow({ groupKey, companies }: { groupKey: string; companies: Company[] }) {
  const mergeCompanies = useMergeCompanies();
  // Por defecto se conserva la más antigua — suele ser la que ya tiene más
  // actividad relacionada (leads, oportunidades, señales) acumulada.
  const sorted = [...companies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [keepId, setKeepId] = useState(sorted[0].id);

  async function handleMerge() {
    const rest = companies.filter((c) => c.id !== keepId);
    for (const dup of rest) {
      await mergeCompanies.mutateAsync({ keepId, mergeId: dup.id });
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Mismo {companies[0].domain ? "dominio" : "nombre"}: <span className="font-mono">{groupKey}</span>
      </p>
      <div className="space-y-1.5">
        {companies.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name={`keep-${groupKey}`}
              checked={keepId === c.id}
              onChange={() => setKeepId(c.id)}
              className="accent-[var(--color-chart-4)]"
            />
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground">
              · creada el {dateFmt.format(new Date(c.created_at))}
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={handleMerge}
        disabled={mergeCompanies.isPending}
        className="bee-btn bee-btn--primary mt-3 text-xs"
      >
        {mergeCompanies.isPending ? "Fusionando…" : "Fusionar en la seleccionada"}
      </button>
    </div>
  );
}

/** Empresas que probablemente son la misma cuenta duplicada — mismo dominio
 *  (o nombre, si ninguna tiene dominio) en más de un registro. No se borra
 *  nada solo: el rep elige cuál conservar y fusiona a demanda. */
export function CompanyDuplicatesPanel() {
  const { data: result } = useCompanyDuplicates();
  const groups = result?.data ?? [];

  if (groups.length === 0) return null;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-chart-1)]/40 bg-[var(--color-chart-1)]/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-[var(--color-chart-1)]" />
        <p className="text-sm font-semibold">
          {groups.length} posible{groups.length === 1 ? "" : "s"} duplicado{groups.length === 1 ? "" : "s"} de empresa
        </p>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <GroupRow key={g.key} groupKey={g.key} companies={g.companies} />
        ))}
      </div>
    </div>
  );
}
