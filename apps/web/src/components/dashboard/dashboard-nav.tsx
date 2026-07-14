"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, LayoutDashboard, Target, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}> = [
  { href: "/dashboard/control", label: "Control", icon: SlidersHorizontal, exact: true },
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/signals", label: "Signals", icon: Radio },
  { href: "/dashboard/strategies", label: "Strategies", icon: Target },
];

/** Secondary nav for the BEE dashboard shell. */
export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2 pb-6"
      aria-label="Dashboard sections"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn("bee-nav-pill", active && "bee-nav-pill--active")}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
