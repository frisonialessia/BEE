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
 * and the isDemoMode() guards across lib/api/*.ts and lib/api.ts.
 *
 * Control, Resiliencia, Red, and Voz de marca were deliberately excluded
 * from this set for a long time: those sections show real backend/
 * infrastructure state (worker health, audit logs, relationship graphs),
 * and a fabricated version of that reads as lying about the system itself
 * rather than illustrating a product feature. The BEE team later asked for
 * a fully realistic simulation of all four anyway, explicitly overriding
 * that default — see the local demo stores in lib/demo/store.ts (network
 * connections, brand voice profile, DLQ events, audit trail…) for what
 * backs them now. They still carry the same "Datos demo" labeling as every
 * other simulated section here; nothing under `/probar` claims to be a real
 * account's actual infrastructure state.
 *
 * Integraciones IS here even though nothing is ever actually connected in
 * the sandbox: unlike the sections above, "nothing connected yet" is the
 * real, honest state — the same screen a just-registered account lands on
 * — so showing it isn't inventing anything (see the DEMO_INTEGRATIONS
 * comment in lib/api/integrations.ts). Clicking "Conectar" explains you
 * need a real account instead of faking an OAuth flow.
 *
 * Secuencias is here too, but only partially — see its own page
 * (`app/probar/sequences/page.tsx`) for why: Biblioteca de mensajes and
 * Automatizaciones are user-authored content, same category as
 * Integraciones' own honesty; Estado (SmartEngagementEngine's live AI
 * classification) is real backend processing like Resiliencia's audit log,
 * so that one tab stays gated instead of faking an AI engine.
 *
 * Everything else in the nav routes to a page that says so honestly
 * instead of faking a working demo. */
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
  "/probar/integrations",
  "/probar/sequences",
  "/probar/control",
  "/probar/network",
  "/probar/brand",
  "/probar/resilience",
  "/probar/calendar",
]);
