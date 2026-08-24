"use client";

import { ChevronDown, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/providers/auth-provider";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Menú de cuenta — quién eres, tu rol, y cerrar sesión. Vive en el encabezado. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-[var(--color-primary)]"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--color-cta)] text-[11px] font-bold text-white">
          {initials(user.full_name)}
        </span>
        <span className="hidden text-xs font-medium sm:inline">{user.full_name.split(" ")[0]}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="bee-glass absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-[var(--radius-lg)]">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{user.role}</p>
          </div>
          <Link
            href="/dashboard/team"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/40"
          >
            <Users className="size-3.5" />
            Equipo
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/40"
          >
            <LogOut className="size-3.5" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
