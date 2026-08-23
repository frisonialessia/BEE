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
  Sparkles,
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
  { href: "/dashboard/assistant", icon: Sparkles, label: "Asistente BEE" },
  { href: "/dashboard/control", icon: SlidersHorizontal, label: "Control", exact: true },
  { href: "/dashboard/opportunities", icon: Target, label: "Oportunidades" },
  { href: "/dashboard/signals", icon: Radio, label: "Señales" },
  { href: "/dashboard/strategies", icon: Lightbulb, label: "Estrategias" },
  { href: "/dashboard/dark-funnel", icon: Flame, label: "Pipeline oculto" },
  { href: "/dashboard/network", icon: Zap, label: "Red" },
  { href: "/dashboard/brand", icon: Fingerprint, label: "Voz de marca" },
  { href: "/dashboard/sequences", icon: Workflow, label: "Secuencias" },
  { href: "/dashboard/resilience", icon: ShieldCheck, label: "Resiliencia" },
] as const;

/** Sidebar lateral con nombre de página visible en cada ítem de navegación. */
export function DashboardRail() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="bee-rail" aria-label="Navegación principal">
      <Link href="/dashboard" className="mb-4 px-1.5" aria-label="Inicio BEE">
        <Logo />
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
            >
              <Icon className="size-4 shrink-0 stroke-[1.5]" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2">
        <Link
          href="/dashboard/team"
          className={cn(
            "bee-rail-link",
            pathname.startsWith("/dashboard/team") && "bee-rail-link--active",
          )}
        >
          <Users className="size-4 shrink-0 stroke-[1.5]" />
          <span>{user ? `${user.full_name}` : "Equipo"}</span>
        </Link>
        <button type="button" onClick={logout} className="bee-rail-link">
          <LogOut className="size-4 shrink-0 stroke-[1.5]" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
