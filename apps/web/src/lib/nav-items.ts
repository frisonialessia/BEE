import {
  Building2,
  CalendarDays,
  Crosshair,
  Fingerprint,
  Flame,
  KanbanSquare,
  LayoutDashboard,
  Lightbulb,
  Plug,
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

/** `labelKey` indexes into messages/{locale}/nav.json's `items` object
 *  (e.g. "overview" → nav.items.overview) — resolved at render time via
 *  `useTranslations("nav.items")` in DashboardRail/CommandPalette, not
 *  stored here as a literal string. Keeping a `labelKey` (not `label`)
 *  makes that contract explicit at the type level: nothing can render this
 *  value directly and accidentally ship an untranslated key name. */
export interface NavItem {
  href: string;
  icon: LucideIcon;
  labelKey: string;
  exact?: boolean;
}

export interface NavGroup {
  /** Indexes into nav.json's `groups` object (e.g. "accounts") — same
   *  render-time-resolution contract as `NavItem.labelKey`. `null` for the
   *  ungrouped "Resumen" entry, which has no group heading at all. */
  groupKey: string | null;
  items: NavItem[];
}

/** Fuente única de la navegación principal — el sidebar (DashboardRail) y
 *  el Command Palette leen de aquí, para que nunca queden desincronizados. */
export const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: null,
    items: [{ href: "/dashboard", icon: LayoutDashboard, labelKey: "overview", exact: true }],
  },
  {
    groupKey: "accounts",
    items: [
      { href: "/dashboard/crm", icon: KanbanSquare, labelKey: "crm" },
      { href: "/dashboard/companies", icon: Building2, labelKey: "companies" },
      { href: "/dashboard/leads", icon: Users, labelKey: "leads" },
      { href: "/dashboard/opportunities", icon: Target, labelKey: "opportunities" },
      { href: "/dashboard/calendar", icon: CalendarDays, labelKey: "calendar" },
    ],
  },
  {
    groupKey: "intelligence",
    items: [
      { href: "/dashboard/priority", icon: Crosshair, labelKey: "priority" },
      { href: "/dashboard/signals", icon: Radio, labelKey: "signals" },
      { href: "/dashboard/strategies", icon: Lightbulb, labelKey: "strategies" },
      { href: "/dashboard/dark-funnel", icon: Flame, labelKey: "darkFunnel" },
      { href: "/dashboard/forecast", icon: TrendingUp, labelKey: "forecast" },
      { href: "/dashboard/win-loss", icon: Scale, labelKey: "winLoss" },
    ],
  },
  {
    groupKey: "operations",
    items: [
      { href: "/dashboard/control", icon: SlidersHorizontal, labelKey: "control", exact: true },
      { href: "/dashboard/network", icon: Zap, labelKey: "network" },
      { href: "/dashboard/brand", icon: Fingerprint, labelKey: "brand" },
      { href: "/dashboard/sequences", icon: Workflow, labelKey: "sequences" },
      { href: "/dashboard/integrations", icon: Plug, labelKey: "integrations" },
      { href: "/dashboard/resilience", icon: ShieldCheck, labelKey: "resilience" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
