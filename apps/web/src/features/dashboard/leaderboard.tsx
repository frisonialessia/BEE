"use client";

import { Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeamOut, UserOut } from "@/types/auth";
import type { Opportunity } from "@/types/domain";
import { formatCurrencyUSDCompact } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";

const RANK_COLOR = ["var(--color-chart-1)", "var(--color-text-muted)", "var(--color-chart-2)"] as const;
const ALL_TEAMS = "__all__";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Leaderboard — ranking real de vendedores por oportunidades ganadas +
 * ingreso cerrado, con corte opcional por equipo. Se arma con datos que ya
 * existen (Opportunity.assigned_to_user_id/amount + User.team_id); no hay
 * puntuación inventada, es un conteo y una suma directos. El filtro de
 * equipo es puramente client-side — la misma lista de oportunidades ya
 * cargada, solo agrupada distinto — no dispara una query nueva.
 */
export function Leaderboard({
  opportunities,
  users,
  teams,
}: {
  opportunities: Opportunity[];
  users: UserOut[];
  teams: TeamOut[];
}) {
  const t = useTranslations("dashboardOverview.leaderboard");
  const locale = useLocale() as Locale;
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const ranked = useMemo(() => {
    const stats = new Map<string, { won: number; revenue: number }>();
    for (const opp of opportunities) {
      if (opp.status !== "won" || !opp.assigned_to_user_id) continue;
      const rep = usersById.get(opp.assigned_to_user_id);
      if (!rep) continue;
      if (teamFilter !== ALL_TEAMS && rep.team_id !== teamFilter) continue;
      const entry = stats.get(rep.id) ?? { won: 0, revenue: 0 };
      entry.won += 1;
      entry.revenue += opp.amount ?? 0;
      stats.set(rep.id, entry);
    }
    return Array.from(stats.entries())
      .map(([userId, s]) => ({ user: usersById.get(userId)!, ...s }))
      .sort((a, b) => b.won - a.won || b.revenue - a.revenue)
      .slice(0, 5);
  }, [opportunities, usersById, teamFilter]);

  // Only teams that actually have a member — an empty org-structure team
  // in the filter would just be a dead end that always shows "sin datos".
  const teamsWithMembers = useMemo(
    () => teams.filter((team) => users.some((u) => u.team_id === team.id)),
    [teams, users],
  );

  return (
    <div className="bee-surface bee-bento-pad">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-[var(--color-chart-1)]" />
          <h2 className="bee-card-title">{t("title")}</h2>
        </div>
        {teamsWithMembers.length > 1 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            aria-label={t("teamFilterAria")}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-chart-4)]"
          >
            <option value={ALL_TEAMS}>{t("allTeams")}</option>
            {teamsWithMembers.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-10 text-center">
          <Trophy className="size-6 text-muted-foreground/40" />
          <p className="text-sm font-light text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {ranked.map((row, i) => {
            const pct = Math.round((row.won / ranked[0].won) * 100);
            return (
              <li key={row.user.id} className="bee-bento flex items-center gap-3 p-2.5">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: RANK_COLOR[i] ?? "var(--color-text-muted)" }}
                >
                  {i + 1}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-chart-4)]/20 text-xs font-semibold text-[var(--color-chart-4)]">
                  {initials(row.user.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{row.user.full_name}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--color-card)]">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${pct}%`, background: RANK_COLOR[i] ?? "var(--color-chart-4)" }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("tooltip", { won: row.won, pct, leaderName: ranked[0].user.full_name })}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">{row.won}</p>
                  {row.revenue > 0 && (
                    <p className="bee-micro tabular-nums">{formatCurrencyUSDCompact(row.revenue, locale)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
