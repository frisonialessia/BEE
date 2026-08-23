"use client";

import { useUsers } from "@/hooks/queries/use-users";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Presencia del equipo — decorativa: miembros reales (no inventados) con un
 * indicador "en línea". BEE no tiene todavía un canal en tiempo real que
 * sepa quién está conectado de verdad, así que el estado es una
 * simulación visual sobre datos reales, no una medición. Vive dentro del
 * encabezado (ver DashboardHeader), no flotando aparte.
 */
export function TeamPresence() {
  const { data: users } = useUsers();
  const team = (users ?? []).slice(0, 4);

  if (team.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {team.map((user) => (
          <span key={user.id} className="bee-presence-avatar" title={user.full_name}>
            {initials(user.full_name)}
            <span className="bee-presence-dot" aria-hidden />
          </span>
        ))}
      </div>
      {team.length > 1 && (
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {team.length} en línea
        </span>
      )}
    </div>
  );
}
