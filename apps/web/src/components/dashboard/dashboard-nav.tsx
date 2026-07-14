"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, LayoutDashboard, Target } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/signals", label: "Signals", icon: Radio },
  { href: "/dashboard/strategies", label: "Strategies", icon: Target },
];

/** Secondary nav for the Señales y Estrategia dashboard shell. */
export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border/60 pb-4"
      aria-label="Dashboard sections"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
