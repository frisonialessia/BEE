"use client";

import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";
import { useUsers } from "@/hooks/queries/use-users";

/**
 * The sandbox's account menu — same shape as the real `AccountMenu`
 * (avatar, name, email, role, one action), so `/probar`'s header reads
 * exactly like a person's own organization instead of a stripped-down
 * demo banner. Sourced from `useUsers()` (the same demo-aware hook every
 * other sandbox page already reads) rather than a second hardcoded
 * persona, so it can never drift from the actual seeded team — the first
 * user in that list stands in as "you". No "Team" link: `/probar/team`
 * doesn't exist (a single-visitor sandbox has no one else's account to
 * administer), and no real session to end, so the closing action leaves
 * the sandbox instead of logging out.
 */
export function AccountMenuDemo() {
  const { data: users } = useUsers();
  const t = useTranslations("common.accountMenuDemo");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const me = users?.[0];
  if (!me) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-[var(--color-primary)]"
      >
        <Avatar id={me.id} name={me.full_name} avatarUrl={me.avatar_url} avatarColor={me.avatar_color} size={28} className="text-micro" />
        <span className="hidden text-xs font-medium lg:inline">{me.full_name.split(" ")[0]}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="bee-glass absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-[var(--radius-lg)]">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            <p className="mt-1 bee-eyebrow">{me.role}</p>
          </div>
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-left text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/40"
          >
            <LogOut className="size-3.5" />
            {t("exit")}
          </Link>
        </div>
      )}
    </div>
  );
}
