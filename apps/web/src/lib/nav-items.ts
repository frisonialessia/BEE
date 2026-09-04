import {
  Building2,
  CalendarDays,
  Fingerprint,
  KanbanSquare,
  LayoutDashboard,
  Lightbulb,
  Plug,
  Radio,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
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
    // CRM/Oportunidades and Companies/Leads were each two rows here —
    // both pairs are now one page with tabs (CrmView, CompaniesList); the
    // merged-away hrefs (/opportunities, /leads) still work as redirects,
    // see app/dashboard/{opportunities,leads}/page.tsx.
    groupKey: "accounts",
    items: [
      { href: "/dashboard/crm", icon: KanbanSquare, labelKey: "crm" },
      { href: "/dashboard/companies", icon: Building2, labelKey: "companies" },
      { href: "/dashboard/calendar", icon: CalendarDays, labelKey: "calendar" },
    ],
  },
  {
    // Signals/Priority/Dark Funnel and Forecast/Win-Loss, same "tabs, not
    // rows" treatment — see signals-dashboard.tsx / forecast-view.tsx. The
    // merged-away /dark-funnel still works as a redirect to
    // /signals?tab=intent, see app/dashboard/dark-funnel/page.tsx.
    groupKey: "intelligence",
    items: [
      { href: "/dashboard/signals", icon: Radio, labelKey: "signals" },
      { href: "/dashboard/strategies", icon: Lightbulb, labelKey: "strategies" },
      { href: "/dashboard/forecast", icon: TrendingUp, labelKey: "forecast" },
      { href: "/dashboard/sales", icon: Trophy, labelKey: "sales" },
    ],
  },
  {
    // Control/Resilience, same treatment — see app/dashboard/control/page.tsx.
    groupKey: "operations",
    items: [
      { href: "/dashboard/control", icon: SlidersHorizontal, labelKey: "control", exact: true },
      { href: "/dashboard/network", icon: Zap, labelKey: "network" },
      { href: "/dashboard/brand", icon: Fingerprint, labelKey: "brand" },
      { href: "/dashboard/sequences", icon: Workflow, labelKey: "sequences" },
      { href: "/dashboard/integrations", icon: Plug, labelKey: "integrations" },
    ],
  },
  {
    // Ungrouped, like "Resumen" above — but trailing, not leading: this
    // renders last, right above DashboardRail's own collapse toggle /
    // mobile language switcher, the conventional "settings pinned at the
    // bottom, separate from content nav" spot. Team (members, roles,
    // autopilot, federated intelligence, quotas, outbound webhooks,
    // delete-account) was previously reachable ONLY from AccountMenu's
    // dropdown in the header — real, frequently-needed configuration
    // buried one extra click behind an avatar, unlike every other page
    // in this app. AccountMenu keeps its own "Equipo" shortcut too (a
    // second, harmless entry point to the same page, same as most SaaS
    // apps); this is the fix for discoverability, not a replacement.
    groupKey: null,
    items: [{ href: "/dashboard/team", icon: Settings, labelKey: "team" }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
