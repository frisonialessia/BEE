"use client";

import { useTranslations } from "next-intl";

import { useUsers } from "@/hooks/queries/use-users";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Team strip in the header — the organization's real members as avatars.
 * Deliberately *not* a presence indicator: BEE has no realtime channel that
 * knows who is connected, and the previous version painted a green "online"
 * dot on every member plus "N en línea" — an invented fact shown to a real
 * customer (and floating fake cursors with teammates' names, now removed).
 * What can be stated truthfully is who is on the team and how many.
 */
export function TeamPresence() {
  const t = useTranslations("common.teamStrip");
  const { data: users } = useUsers();
  const team = (users ?? []).slice(0, 4);

  if (team.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {team.map((user) => (
          <span key={user.id} className="bee-presence-avatar" title={user.full_name}>
            {initials(user.full_name)}
          </span>
        ))}
      </div>
      {team.length > 1 && (
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {t("members", { count: users?.length ?? team.length })}
        </span>
      )}
    </div>
  );
}
