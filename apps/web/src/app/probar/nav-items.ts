import { NAV_GROUPS } from "@/lib/nav-items";
import type { NavGroup } from "@/lib/nav-items";

/** Same shape and content as the real Dashboard's NAV_GROUPS (same icons,
 * same labels, same grouping — someone moving from the sandbox to a real
 * account should recognize the menu instantly), just every href rewritten
 * from `/dashboard/...` to `/probar/...`. Kept as a derived mapping, not a
 * hand-copied list, so the two navs can never drift out of sync. */
export const PROBAR_NAV_GROUPS: NavGroup[] = NAV_GROUPS.map((group) => ({
  ...group,
  items: group.items.map((item) => ({
    ...item,
    href: item.href.replace(/^\/dashboard/, "/probar"),
  })),
}));

/** The only sections actually simulated in the sandbox today — see
 * lib/demo/store.ts. Everything else in the nav routes to a page that says
 * so honestly instead of faking data (this product's honesty policy: never
 * dress up "not built yet" as if it were live). */
export const PROBAR_LIVE_SECTIONS = new Set(["/probar", "/probar/signals", "/probar/crm"]);
