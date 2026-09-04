"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { DATA } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { useCreateQuota, useDeleteQuota, useQuotas } from "@/hooks/queries/use-quotas";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/i18n/format";
import { computeQuotaActual, computeQuotaAttainment, computeQuotaClients } from "@/lib/quotas";
import type { TeamOut, UserOut } from "@/types/auth";

function monthBounds(offset = 0): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function currencyFor(users: UserOut[], teams: TeamOut[], ownerType: "user" | "team", ownerId: string): string {
  if (ownerType === "team") return teams.find((t) => t.id === ownerId)?.currency ?? "USD";
  const teamId = users.find((u) => u.id === ownerId)?.team_id;
  return teams.find((t) => t.id === teamId)?.currency ?? teams[0]?.currency ?? "USD";
}

/** Meta mensual por persona o equipo: monto en la divisa del equipo y/o
 *  número de clientes nuevos. Admin y manager la definen. */
function GoalForm({ users, teams, onDone }: { users: UserOut[]; teams: TeamOut[]; onDone: () => void }) {
  const t = useTranslations("workspace.team.quotas.form");
  const createQuota = useCreateQuota();
  const current = monthBounds();
  const [ownerType, setOwnerType] = useState<"user" | "team">("user");
  const [ownerId, setOwnerId] = useState("");
  const [periodStart, setPeriodStart] = useState(current.start);
  const [periodEnd, setPeriodEnd] = useState(current.end);
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("");
  const currency = currencyFor(users, teams, ownerType, ownerId);
  const valid = Boolean(ownerId && periodStart && periodEnd && (Number(amount) > 0 || Number(count) > 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    await createQuota.mutateAsync({
      ...(ownerType === "user" ? { user_id: ownerId } : { team_id: ownerId }),
      period_start: periodStart,
      period_end: periodEnd,
      target_amount: Number(amount) > 0 ? Number(amount) : undefined,
      target_count: Number(count) > 0 ? Number(count) : undefined,
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="bee-bento space-y-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("newTitle")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={ownerType} onChange={(e) => { setOwnerType(e.target.value as "user" | "team"); setOwnerId(""); }} className="bee-input">
          <option value="user">{t("byPerson")}</option>
          <option value="team">{t("byTeam")}</option>
        </select>
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="bee-input">
          <option value="">{ownerType === "user" ? t("choosePerson") : t("chooseTeam")}</option>
          {(ownerType === "user" ? users : teams).map((o) => (
            <option key={o.id} value={o.id}>
              {"full_name" in o ? o.full_name : o.name}
            </option>
          ))}
        </select>
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bee-input" />
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bee-input" />
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("amountPlaceholder", { currency })}
          className="bee-input"
        />
        <input
          type="number"
          min="0"
          step="1"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder={t("countPlaceholder")}
          className="bee-input"
        />
      </div>
      <p className="bee-caption">{t("hint")}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || createQuota.isPending} className="bee-btn bee-btn--primary">
          {createQuota.isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className="bee-btn-text">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

export function QuotasSection({ users, teams, canManage }: { users: UserOut[]; teams: TeamOut[]; canManage: boolean }) {
  const t = useTranslations("workspace.team.quotas");
  const locale = useLocale() as Locale;
  const { data: quotasResult, isLoading: quotasLoading } = useQuotas();
  const { data: oppsResult, isLoading: oppsLoading } = useOpportunities(undefined, 300);
  const deleteQuota = useDeleteQuota();
  const [showNew, setShowNew] = useState(false);

  const quotas = quotasResult?.data ?? [];
  const opportunities = oppsResult?.data ?? [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((x) => [x.id, x]));
  const loading = quotasLoading || oppsLoading;

  return (
    <OverviewCard
      title={t("title")}
      caption={t("eyebrow")}
      action={
        canManage && (
          <button type="button" onClick={() => setShowNew((v) => !v)} className="bee-btn bee-btn--primary text-xs">
            {t("newQuota")}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {showNew && <GoalForm users={users} teams={teams} onDone={() => setShowNew(false)} />}

        {loading ? (
          <p className="bee-caption">{t("loading")}</p>
        ) : quotas.length === 0 ? (
          <p className="bee-caption">{canManage ? t("emptyManage") : t("emptyView")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {quotas.map((q) => {
              const owner = q.user_id ? userById.get(q.user_id)?.full_name : teamById.get(q.team_id ?? "")?.name;
              const teamId = q.team_id ?? userById.get(q.user_id ?? "")?.team_id ?? null;
              const currency = (teamId && teamById.get(teamId)?.currency) || teams[0]?.currency || "USD";
              const actual = computeQuotaActual(q, users, opportunities);
              const clients = computeQuotaClients(q, users, opportunities);
              const attainment = computeQuotaAttainment(q, users, opportunities);
              const reached = attainment >= 1;
              return (
                <div key={q.id} className="bee-bento flex items-center gap-4 p-4">
                  <ProgressRing value={attainment} size={52} stroke={5} color={reached ? DATA.honey : DATA.indigo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{owner ?? t("ownerFallback")}</p>
                    <p className="bee-micro">
                      {q.period_start} → {q.period_end}
                    </p>
                    <p className="mt-1 text-xs tabular-nums">
                      {q.target_amount > 0 && (
                        <span>{formatMoney(actual, currency, locale)} / {formatMoney(q.target_amount, currency, locale)}</span>
                      )}
                      {q.target_amount > 0 && q.target_count ? " · " : ""}
                      {q.target_count ? <span>{t("clients", { actual: clients, target: q.target_count })}</span> : null}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => deleteQuota.mutate(q.id)}
                      disabled={deleteQuota.isPending}
                      className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:text-[var(--color-text)]"
                      aria-label={t("deleteAria")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OverviewCard>
  );
}
