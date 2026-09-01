"use client";

import { Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateQuota, useDeleteQuota, useQuotas } from "@/hooks/queries/use-quotas";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { formatCurrencyUSD } from "@/lib/i18n/format";
import { computeQuotaActual } from "@/lib/quotas";
import type { TeamOut, UserOut } from "@/types/auth";

function QuotaForm({
  users,
  teams,
  onDone,
}: {
  users: UserOut[];
  teams: TeamOut[];
  onDone: () => void;
}) {
  const createQuota = useCreateQuota();
  const [ownerType, setOwnerType] = useState<"user" | "team">("user");
  const [ownerId, setOwnerId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId || !periodStart || !periodEnd || !amount) return;
    await createQuota.mutateAsync({
      [ownerType === "user" ? "user_id" : "team_id"]: ownerId,
      period_start: periodStart,
      period_end: periodEnd,
      target_amount: Number(amount),
    });
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--color-primary)]/25 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nueva cuota</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select
          value={ownerType}
          onChange={(e) => {
            setOwnerType(e.target.value as "user" | "team");
            setOwnerId("");
          }}
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        >
          <option value="user">Por persona</option>
          <option value="team">Por equipo</option>
        </select>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        >
          <option value="">{ownerType === "user" ? "Elegir persona…" : "Elegir equipo…"}</option>
          {(ownerType === "user" ? users : teams).map((item) => (
            <option key={item.id} value={item.id}>
              {"full_name" in item ? item.full_name : item.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        />
        <input
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          required
          className="rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none"
        />
      </div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Monto objetivo (USD)"
        required
        min="1"
        className="mt-2 w-full rounded-[var(--radius-md)] border border-border bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!ownerId || !periodStart || !periodEnd || !amount || createQuota.isPending}
          className="bee-btn bee-btn--primary"
        >
          {createQuota.isPending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Cuotas por persona o por equipo — objetivo vs. lo realmente ganado en el
 *  período, calculado del lado del cliente a partir de las oportunidades ya
 *  cargadas (mismo patrón que el resto de la BI de BEE). El "territorio" es
 *  simplemente un equipo existente — no duplicamos ese concepto aparte. */
export function QuotasSection({
  users,
  teams,
  canManage,
}: {
  users: UserOut[];
  teams: TeamOut[];
  canManage: boolean;
}) {
  const locale = useLocale() as Locale;
  const { data: quotasResult, isLoading: quotasLoading } = useQuotas();
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 300);
  const deleteQuota = useDeleteQuota();
  const [showNew, setShowNew] = useState(false);

  const quotas = quotasResult?.data ?? [];
  const opportunities = oppsResult?.data ?? [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const loading = quotasLoading || oppsLoading;

  function actualFor(quota: (typeof quotas)[number]): number {
    return computeQuotaActual(quota, users, opportunities);
  }

  return (
    <section className="bee-bento bee-bento-pad-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="bee-eyebrow">Territorios y cuotas</p>
          <h2 className="mt-1 text-base font-semibold">Objetivo vs. logrado</h2>
        </div>
        {canManage && (
          <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary text-xs">
            + Nueva cuota
          </button>
        )}
      </div>

      {showNew && <QuotaForm users={users} teams={teams} onDone={() => setShowNew(false)} />}

      {loading ? (
        <p className="bee-caption">Cargando…</p>
      ) : quotas.length === 0 ? (
        <p className="bee-caption">
          {canManage ? "Todavía no hay cuotas — crea la primera arriba." : "Todavía no hay cuotas asignadas."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {quotas.map((q) => {
            const owner = q.user_id ? userById.get(q.user_id)?.full_name : teamById.get(q.team_id ?? "")?.name;
            const actual = actualFor(q);
            const pct = Math.min(100, Math.round((actual / q.target_amount) * 100));
            return (
              <div key={q.id} className="bee-bento p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{owner ?? "—"}</p>
                    <p className="bee-micro">
                      {q.period_start} → {q.period_end}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-muted-foreground">
                      {formatCurrencyUSD(actual, locale)} / {formatCurrencyUSD(q.target_amount, locale)} · {pct}%
                    </p>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteQuota.mutate(q.id)}
                        disabled={deleteQuota.isPending}
                        className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-[var(--color-chart-2)]/20 hover:text-[var(--color-chart-2)]"
                        aria-label="Eliminar cuota"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-primary)]/25">
                      <div
                        className="h-full rounded-full bg-[var(--color-chart-4)] transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatCurrencyUSD(actual, locale)} de {formatCurrencyUSD(q.target_amount, locale)} ({pct}%)
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
