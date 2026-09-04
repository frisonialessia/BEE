"use client";

import { Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { DATA, SALES, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useTeams } from "@/hooks/queries/use-teams";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/i18n/format";
import { computeQuotaAttainment, isQuotaActive } from "@/lib/quotas";

// One color per box: honey at three strengths by rank (greens on Ventas).
const RANK_TONE = [DATA.honey, mix(DATA.honey, 60), mix(DATA.honey, 35)];
// Ventas is greens-only: the podium avatars go won → lime → mint, mint
// with dark text so it still reads.
const RANK_TONE_SALES = [SALES.won, SALES.lime, SALES.mint];

/**
 * Ranking del equipo por ingresos ganados en el periodo, con el anillo de
 * avance a la meta activa de cada persona (monto y/o clientes). En Ventas
 * (`sales`) la fila que supera su meta se pinta de verde; en cualquier
 * otra página el verde no aparece: el anillo lleno en miel ya lo dice.
 */
export function TeamGoalRanking({
  days = 30,
  month = false,
  sales = false,
  limit = 3,
  bars = false,
}: {
  days?: number;
  /** Rank by the current calendar month instead of trailing `days` — what Ventas uses so the ranking and the monthly goals share a period. */
  month?: boolean;
  sales?: boolean;
  limit?: number;
  /** Resumen: a bar per rep under the list, so the box never ends in a gap. */
  bars?: boolean;
}) {
  const t = useTranslations("dashboardOverview.goalRanking");
  const locale = useLocale() as Locale;
  const { data: oppsResult } = useOpportunities(undefined, 300);
  const { data: users } = useUsers();
  const { data: quotasResult } = useQuotas();
  const { data: teamsData } = useTeams();

  const rows = useMemo(() => {
    const opportunities = oppsResult?.data ?? [];
    const quotas = quotasResult?.data ?? [];
    const teams = teamsData ?? [];
    const allUsers = users ?? [];
    const today = new Date();
    const from = month ? new Date(today.getFullYear(), today.getMonth(), 1).getTime() : today.getTime() - days * 86_400_000;
    const byRep = new Map<string, { value: number; deals: number }>();
    for (const o of opportunities) {
      if (o.status !== "won" || !o.assigned_to_user_id || !o.closed_at) continue;
      if (new Date(o.closed_at).getTime() < from) continue;
      const row = byRep.get(o.assigned_to_user_id) ?? { value: 0, deals: 0 };
      row.value += o.amount ?? 0;
      row.deals += 1;
      byRep.set(o.assigned_to_user_id, row);
    }
    return [...byRep.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, limit)
      .map(([userId, row]) => {
        const user = allUsers.find((u) => u.id === userId);
        const goal = quotas.find((q) => q.user_id === userId && isQuotaActive(q, today));
        const currency = teams.find((x) => x.id === user?.team_id)?.currency ?? teams[0]?.currency ?? "USD";
        // Goals are monthly. Ranked by calendar month the ring is the plain
        // month attainment; ranked over a trailing window the goal is scaled
        // to that window (90 days ≈ 3 monthly goals) so the ring and the
        // amount beside it speak about the same period.
        const attainment = !goal
          ? null
          : month
            ? computeQuotaAttainment(goal, allUsers, opportunities)
            : goal.target_amount > 0
              ? row.value / (goal.target_amount * (days / 30))
              : null;
        return {
          userId,
          name: user?.full_name ?? t("unknown"),
          avatarUrl: user?.avatar_url ?? null,
          currency,
          attainment,
          ...row,
        };
      });
  }, [oppsResult, quotasResult, teamsData, users, days, month, limit, t]);

  if (rows.length === 0) return <p className="bee-caption py-6 text-center">{t("empty")}</p>;

  const list = (
    <ol className="flex flex-1 flex-col justify-evenly gap-2">
      {rows.map((rep, i) => {
        const reached = rep.attainment !== null && rep.attainment >= 1;
        const ringColor = sales ? (reached ? SALES.won : SALES.lime) : DATA.honey;
        const bg = sales ? (reached ? mix(SALES.mint, 70) : i === 0 ? mix(SALES.mint, 40) : undefined) : i === 0 ? mix(DATA.honeyFill, 22) : undefined;
        const avatar = sales ? RANK_TONE_SALES[i] ?? SALES.mint : RANK_TONE[i] ?? mix(DATA.honey, 35);
        const avatarText = i >= 1 ? "var(--color-text)" : "#fff";
        return (
          // Fixed columns (# · avatar · name · ring · amount) so every rank,
          // ring and figure lines up down the list.
          <li key={rep.userId} className="grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_2.25rem_4.5rem] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2" style={bg ? { background: bg } : undefined}>
            <span className="bee-micro font-semibold text-[var(--color-text)]">#{i + 1}</span>
            {rep.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from the user's own profile, any host
              <img src={rep.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: avatar, color: avatarText }}>
                {rep.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-medium">
                {i === 0 && <Trophy className="size-3.5 shrink-0" style={{ color: sales ? SALES.won : DATA.honey }} />}
                <span className="truncate">{rep.name}</span>
              </p>
              <p className="bee-micro">{t("deals", { count: rep.deals })}{rep.attainment === null ? ` · ${t("noGoal")}` : ""}</p>
            </div>
            <span className="flex justify-center">{rep.attainment !== null && <ProgressRing value={rep.attainment} size={36} stroke={4} color={ringColor} />}</span>
            <span className="text-right text-sm font-bold tabular-nums">{formatMoney(rep.value, rep.currency, locale, true)}</span>
          </li>
        );
      })}
    </ol>
  );
  if (!bars) return list;
  return (
    <div className="bee-fill flex flex-col gap-3">
      {list}
      <BarsVsTarget
        points={rows.map((r) => ({ label: r.name.split(/\s+/)[0], value: r.value }))}
        minHeight={72}
        formatValue={(v) => formatMoney(v, rows[0]?.currency ?? "USD", locale, true)}
        colorFor={(_p, i) => (sales ? RANK_TONE_SALES[i] ?? SALES.mint : RANK_TONE[i] ?? mix(DATA.honey, 35))}
      />
    </div>
  );
}
