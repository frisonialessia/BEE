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

/** The sections actually simulated in the sandbox today, read-only except
 * the pipeline itself (drag a card, mark won/lost) — see lib/demo/store.ts
 * and the isDemoMode() guards across lib/api/*.ts. Control, Resiliencia,
 * Red, Voz de marca, and now Integraciones are deliberately NOT here and
 * never will be by faking their data: those show real backend/
 * infrastructure state (worker health, audit logs, relationship graphs, a
 * real connected Gmail account), and inventing that would be lying about
 * the system itself, not illustrating a product feature — the same
 * honesty policy the rest of BEE holds to. Secuencias isn't here either,
 * not on principle — its flow-builder just needs more plumbing than a
 * first pass covered. Everything else in the nav routes to a page that
 * says so honestly instead of faking a working demo. */
export const PROBAR_LIVE_SECTIONS = new Set([
  "/probar",
  "/probar/signals",
  "/probar/crm",
  "/probar/companies",
  "/probar/leads",
  "/probar/opportunities",
  "/probar/strategies",
  "/probar/priority",
  "/probar/dark-funnel",
  "/probar/forecast",
  "/probar/win-loss",
]);
