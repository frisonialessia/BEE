import { Trophy } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserOut } from "@/types/auth";
import type { Opportunity } from "@/types/domain";

const RANK_COLOR = ["var(--color-chart-1)", "var(--color-text-muted)", "var(--color-chart-2)"] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Leaderboard — ranking real de vendedores por oportunidades ganadas.
 * Se arma con datos que ya existen (Opportunity.assigned_to_user_id +
 * lista de usuarios); no hay puntuación inventada, es un conteo directo.
 */
export function Leaderboard({
  opportunities,
  users,
}: {
  opportunities: Opportunity[];
  users: UserOut[];
}) {
  const usersById = new Map(users.map((u) => [u.id, u]));

  const wonCounts = new Map<string, number>();
  for (const opp of opportunities) {
    if (opp.status !== "won" || !opp.assigned_to_user_id) continue;
    wonCounts.set(opp.assigned_to_user_id, (wonCounts.get(opp.assigned_to_user_id) ?? 0) + 1);
  }

  const ranked = Array.from(wonCounts.entries())
    .map(([userId, won]) => ({ user: usersById.get(userId), won }))
    .filter((r): r is { user: UserOut; won: number } => Boolean(r.user))
    .sort((a, b) => b.won - a.won)
    .slice(0, 5);

  return (
    <div className="bee-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-[var(--color-chart-1)]" />
          <h2 className="text-base font-semibold tracking-tight">Ranking</h2>
        </div>
        <span className="bee-caption">Oportunidades ganadas</span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay oportunidades ganadas asignadas a un miembro del equipo.
        </p>
      ) : (
        <ul className="space-y-2">
          {ranked.map((row, i) => {
            const pct = Math.round((row.won / ranked[0].won) * 100);
            return (
              <li key={row.user.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-primary)]/30 p-2.5">
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
                      {row.won} ganada{row.won === 1 ? "" : "s"} · {pct}% del líder ({ranked[0].user.full_name})
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">{row.won}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
