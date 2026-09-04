"use client";

import { useTranslations } from "next-intl";

import { Avatar } from "@/components/avatar";
import { useUsers } from "@/hooks/queries/use-users";

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
          <Avatar
            key={user.id}
            id={user.id}
            name={user.full_name}
            avatarUrl={user.avatar_url}
            avatarColor={user.avatar_color}
            size={30}
            title={user.full_name}
            className="text-micro border-2 border-[var(--color-background)]"
          />
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
