"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Settings,
  SlidersHorizontal,
  Target,
  User,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const VIEWS: Array<{
  href: string;
  label: string;
  icon: typeof SlidersHorizontal;
  exact?: boolean;
}> = [
  { href: "/dashboard/control", label: "Control", icon: SlidersHorizontal, exact: true },
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/signals", label: "Signals", icon: Radio },
  { href: "/dashboard/strategies", label: "Strategies", icon: Target },
];

/** CRM sidebar — view selector top, profile bottom. */
export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bee-sidebar flex h-full w-[220px] shrink-0 flex-col">
      <div className="px-5 pt-6 pb-4">
        <Link href="/dashboard/control" aria-label="BEE dashboard home">
          <Logo withText={false} />
        </Link>
        <p className="bee-eyebrow mt-4">Workspace</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Dashboard views">
        {VIEWS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "bee-sidebar-link",
                active && "bee-sidebar-link--active",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-3 py-4">
        <button
          type="button"
          className="bee-sidebar-link w-full cursor-default"
          aria-label="User profile"
        >
          <User className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">Operator</span>
        </button>
        <button
          type="button"
          className="bee-sidebar-link w-full"
          aria-label="Settings"
        >
          <Settings className="size-4 shrink-0" strokeWidth={1.75} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
