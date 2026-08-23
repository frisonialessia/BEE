import type { Quota } from "@/lib/api/quotas";
import type { Opportunity } from "@/types/domain";
import type { UserOut } from "@/types/auth";

/** Monto realmente ganado dentro del período de una cuota, para el dueño
 *  que corresponda (una persona, o todos los miembros de un equipo). */
export function computeQuotaActual(
  quota: Quota,
  users: UserOut[],
  opportunities: Opportunity[],
): number {
  const memberIds = quota.user_id
    ? [quota.user_id]
    : users.filter((u) => u.team_id === quota.team_id).map((u) => u.id);

  return opportunities
    .filter(
      (o) =>
        o.status === "won" &&
        o.assigned_to_user_id &&
        memberIds.includes(o.assigned_to_user_id) &&
        o.updated_at.slice(0, 10) >= quota.period_start &&
        o.updated_at.slice(0, 10) <= quota.period_end,
    )
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
}

export interface QuotaPace {
  actual: number;
  elapsedFraction: number; // 0–1, cuánto del período ya pasó
  achievedFraction: number; // 0–1, cuánto del objetivo ya se logró
  /** true si va más atrasado que el tiempo transcurrido, con margen de 15
   *  puntos — para no marcar "atrasado" por ruido de un día. */
  isBehind: boolean;
}

/** Solo tiene sentido para una cuota cuyo período incluye `today` — llamar
 *  con una cuota ya cerrada o futura no tiene un "ritmo" que reportar. */
export function computeQuotaPace(
  quota: Quota,
  users: UserOut[],
  opportunities: Opportunity[],
  today: Date,
): QuotaPace {
  const actual = computeQuotaActual(quota, users, opportunities);
  const start = new Date(quota.period_start);
  const end = new Date(quota.period_end);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (today.getTime() - start.getTime()) / 86_400_000));
  const elapsedFraction = elapsedDays / totalDays;
  const achievedFraction = quota.target_amount > 0 ? actual / quota.target_amount : 0;

  return {
    actual,
    elapsedFraction,
    achievedFraction,
    isBehind: achievedFraction < elapsedFraction - 0.15,
  };
}

export function isQuotaActive(quota: Quota, today: Date): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  return quota.period_start <= todayStr && todayStr <= quota.period_end;
}
