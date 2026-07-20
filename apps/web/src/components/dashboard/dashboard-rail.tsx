"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Calendar,
  LayoutGrid,
  Radio,
  Search,
  Settings,
  Star,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", icon: LayoutGrid, label: "Overview", exact: true },
  { href: "/dashboard", icon: Radio, label: "Signals" },
  { href: "/dashboard", icon: BarChart3, label: "Analytics" },
  { href: "/dashboard", icon: Activity, label: "Activity" },
  { href: "/dashboard", icon: Calendar, label: "Schedule" },
  { href: "/dashboard", icon: Star, label: "Favorites" },
] as const;

export function DashboardRail() {
  const pathname = usePathname();

  return (
    <aside className="bee-rail" aria-label="Primary navigation">
      <Link href="/" className="mb-4" aria-label="BEE home">
        <Logo withText={false} />
      </Link>

      <button
        type="button"
        className="bee-rail-link mb-2"
        aria-label="Search"
      >
        <Search className="size-4 stroke-[1.25]" />
      </button>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon, label, ...rest }) => {
          const exact = "exact" in rest && rest.exact;
          const active = exact ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={label}
              href={href}
              className={cn("bee-rail-link", active && "bee-rail-link--active")}
              aria-label={label}
              title={label}
            >
              <Icon className="size-4 stroke-[1.25]" />
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="bee-rail-link mt-auto"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="size-4 stroke-[1.25]" />
      </Link>
    </aside>
  );
}
