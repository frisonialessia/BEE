"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Fingerprint,
  Flame,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Resumen", exact: true },
  { href: "/dashboard/control", icon: SlidersHorizontal, label: "Control", exact: true },
  { href: "/dashboard/opportunities", icon: Target, label: "Oportunidades" },
  { href: "/dashboard/signals", icon: Radio, label: "Señales" },
  { href: "/dashboard/strategies", icon: Lightbulb, label: "Estrategias" },
  { href: "/dashboard/dark-funnel", icon: Flame, label: "Dark Funnel" },
  { href: "/dashboard/network", icon: Zap, label: "Red" },
  { href: "/dashboard/brand", icon: Fingerprint, label: "Voz de marca" },
  { href: "/dashboard/sequences", icon: Workflow, label: "Secuencias" },
  { href: "/dashboard/resilience", icon: ShieldCheck, label: "Resiliencia" },
] as const;

/** Rail lateral 52px — iconos de línea fina, máxima superficie de trabajo. */
export function DashboardRail() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="bee-rail" aria-label="Navegación principal">
      <Link href="/dashboard" className="mb-3" aria-label="Inicio BEE">
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

      <Link
        href="/dashboard/team"
        className={cn(
          "bee-rail-link",
          pathname.startsWith("/dashboard/team") && "bee-rail-link--active",
        )}
        aria-label="Equipo"
        title={user ? `${user.full_name} · ${user.role}` : "Equipo"}
      >
        <Users className="size-4 stroke-[1.25]" />
      </Link>
      <button
        type="button"
        onClick={logout}
        className="bee-rail-link"
        aria-label="Cerrar sesión"
        title={user ? `Cerrar sesión (${user.email})` : "Cerrar sesión"}
      >
        <LogOut className="size-4 stroke-[1.25]" />
      </button>
    </aside>
  );
}
