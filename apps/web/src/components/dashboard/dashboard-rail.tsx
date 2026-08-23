"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Fingerprint,
  Flame,
  LayoutDashboard,
  Lightbulb,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Workflow,
  Zap,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** El Resumen va primero — es lo más importante, la vista que responde
 *  "¿cómo va todo?" de un vistazo. Cuenta y notificaciones viven en el
 *  encabezado (DashboardHeader), no aquí — este rail es solo navegación. */
const VIEWS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Resumen", exact: true },
  { href: "/dashboard/assistant", icon: Sparkles, label: "Asistente" },
  { href: "/dashboard/companies", icon: Building2, label: "Empresas" },
  { href: "/dashboard/opportunities", icon: Target, label: "Oportunidades" },
  { href: "/dashboard/control", icon: SlidersHorizontal, label: "Control", exact: true },
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
    </aside>
  );
}
