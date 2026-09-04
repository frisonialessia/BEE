"use client";

import { Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { SALES, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { useOpportunities } from "@/hooks/queries/use-opportunities";
import { useQuotas } from "@/hooks/queries/use-quotas";
import { useUsers } from "@/hooks/queries/use-users";
import type { Locale } from "@/i18n/locales";
import { formatAmount } from "@/lib/i18n/format";
import { computeQuotaAttainment, isQuotaActive } from "@/lib/quotas";

// The ranking is about money won, so it is the one box outside Ventas
// that wears the sales greens — the three together, by rank: whoever is
// winning in the main green, the next in lime, everyone after in mint.
const RANK_TONE = [SALES.won, SALES.lime, SALES.mint];
const rankTone = (i: number) => RANK_TONE[Math.min(i, RANK_TONE.length - 1)];

/**
 * Ranking del equipo por ingresos ganados en el periodo, con el anillo de
 * avance a la meta activa de cada persona (monto y/o clientes). Lista a
 * todo el equipo, también a quien aún no cerró en el periodo, para que el
 * Resumen y Ventas muestren a las mismas personas en el mismo orden; la
 * fila que supera su meta se pinta de verde.
 */
export function TeamGoalRanking({
  days = 30,
  month = false,
  sales = false,
  limit,
  bars = false,
}: {
  days?: number;
  /** Rank by the current calendar month instead of trailing `days` — what Ventas uses so the ranking and the monthly goals share a period. */
  month?: boolean;
  /** Kept for call sites; the ranking wears the sales greens everywhere. */
  sales?: boolean;
  /** How many rows to show; omit to list the whole team. */
  limit?: number;
  /** Resumen: a bar per rep under the list, so the box never ends in a gap. */
  bars?: boolean;
}) {
  const t = useTranslations("dashboardOverview.goalRanking");
  const locale = useLocale() as Locale;
  const { data: oppsResult } = useOpportunities(undefined, 2200);
  const { data: users } = useUsers();
  const { data: quotasResult } = useQuotas();

  const rows = useMemo(() => {
    const opportunities = oppsResult?.data ?? [];
    const quotas = quotasResult?.data ?? [];
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
    // Everyone active on the team is in the ranking, with zero when they
    // have not closed in the period — the Resumen and Ventas list the same
    // people, and a rep without a win is visible, not missing.
    for (const u of allUsers) if (u.is_active !== false && !byRep.has(u.id)) byRep.set(u.id, { value: 0, deals: 0 });
    return [...byRep.entries()]
      .sort((a, b) => b[1].value - a[1].value || b[1].deals - a[1].deals)
      .slice(0, limit ?? byRep.size)
      .map(([userId, row]) => {
        const user = allUsers.find((u) => u.id === userId);
        const goal = quotas.find((q) => q.user_id === userId && isQuotaActive(q, today));
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
          attainment,
          ...row,
        };
      });
  }, [oppsResult, quotasResult, users, days, month, limit, t]);
  void sales;

  if (rows.length === 0 || rows.every((r) => r.deals === 0)) return <p className="bee-caption py-6 text-center">{t("empty")}</p>;

  const list = (
    <ol className="flex flex-1 flex-col justify-evenly">
      {rows.map((rep, i) => {
        const reached = rep.attainment !== null && rep.attainment >= 1;
        const tone = rankTone(i);
        const bg = reached ? mix(SALES.mint, 70) : undefined;
        return (
          // Fixed columns (# · avatar · name · ring · amount) so every rank,
          // ring and figure lines up down the list.
          <li key={rep.userId} className="bee-row grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_2.25rem_4.5rem] gap-3 rounded-[var(--radius-md)] px-2" style={bg ? { background: bg } : undefined}>
            <span className="bee-micro font-semibold text-[var(--color-text)]">#{i + 1}</span>
            {rep.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from the user's own profile, any host
              <img src={rep.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--color-text)]" style={{ background: tone }}>
                {rep.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-medium">
                {i === 0 && <Trophy className="size-3.5 shrink-0 text-[var(--color-text)]" />}
                <span className="truncate">{rep.name}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="rounded-full px-2 py-0.5 bee-micro font-medium text-[var(--color-text)]" style={{ background: mix(tone, 45) }}>
                  {t("deals", { count: rep.deals })}
                </span>
                {rep.attainment === null && <span className="bee-micro">{t("noGoal")}</span>}
              </p>
            </div>
            <span className="flex justify-center">{rep.attainment !== null && <ProgressRing value={rep.attainment} size={36} stroke={4} color={tone} />}</span>
            <span className="text-right text-sm font-bold tabular-nums">{formatAmount(rep.value, locale)}</span>
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
        formatValue={(v) => formatAmount(v, locale)}
        colorFor={(_p, i) => rankTone(i)}
      />
    </div>
  );
}
