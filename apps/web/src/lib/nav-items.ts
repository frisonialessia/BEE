import {
  Building2,
  Crosshair,
  Fingerprint,
  Flame,
  LayoutDashboard,
  Lightbulb,
  Radio,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Fuente única de la navegación principal — el sidebar (DashboardRail) y
 *  el Command Palette leen de aquí, para que nunca queden desincronizados. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", icon: LayoutDashboard, label: "Resumen", exact: true }],
  },
  {
    label: "CRM",
    items: [
      { href: "/dashboard/companies", icon: Building2, label: "Empresas" },
      { href: "/dashboard/leads", icon: Users, label: "Leads" },
      { href: "/dashboard/opportunities", icon: Target, label: "Oportunidades" },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { href: "/dashboard/priority", icon: Crosshair, label: "Priorización" },
      { href: "/dashboard/signals", icon: Radio, label: "Señales" },
      { href: "/dashboard/strategies", icon: Lightbulb, label: "Estrategias" },
      { href: "/dashboard/dark-funnel", icon: Flame, label: "Pipeline oculto" },
      { href: "/dashboard/forecast", icon: TrendingUp, label: "Pronóstico" },
      { href: "/dashboard/win-loss", icon: Scale, label: "Ganado/Perdido" },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/dashboard/control", icon: SlidersHorizontal, label: "Control", exact: true },
      { href: "/dashboard/network", icon: Zap, label: "Red" },
      { href: "/dashboard/brand", icon: Fingerprint, label: "Voz de marca" },
      { href: "/dashboard/sequences", icon: Workflow, label: "Secuencias" },
      { href: "/dashboard/resilience", icon: ShieldCheck, label: "Resiliencia" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
