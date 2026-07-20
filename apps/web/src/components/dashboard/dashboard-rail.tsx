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

const VIEWS = [
  { href: "/dashboard/control", icon: SlidersHorizontal, label: "Control", exact: true },
  { href: "/dashboard", icon: LayoutDashboard, label: "Resumen", exact: true },
  { href: "/dashboard/signals", icon: Radio, label: "Señales" },
  { href: "/dashboard/strategies", icon: Target, label: "Estrategias" },
] as const;

/** Rail lateral 52px — iconos de línea fina, máxima superficie de trabajo. */
export function DashboardRail() {
  const pathname = usePathname();

  return (
    <aside className="bee-rail" aria-label="Navegación principal">
      <Link href="/dashboard/control" className="mb-3" aria-label="Inicio BEE">
        <Logo withText={false} />
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {VIEWS.map(({ href, icon: Icon, label, ...rest }) => {
          const exact = "exact" in rest && rest.exact;
          const active = exact ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
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

      <button
        type="button"
        className="bee-rail-link"
        aria-label="Operador"
        title="Operador"
      >
        <User className="size-4 stroke-[1.25]" />
      </button>
      <Link
        href="/dashboard"
        className="bee-rail-link"
        aria-label="Configuración"
        title="Configuración"
      >
        <Settings className="size-4 stroke-[1.25]" />
      </Link>
    </aside>
  );
}
