import { getClientLocale } from "@/i18n/client-locale";
import { LOCALE_COOKIE } from "@/i18n/cookie";
import type { Locale } from "@/i18n/locales";

/**
 * Reads the visitor's current language directly from the `NEXT_LOCALE`
 * cookie — the cookie `proxy.ts` keeps in sync with the browser language
 * and `i18n/request.ts` falls back to server-side. The demo data
 * layer (`lib/sample-data.ts`, `lib/demo/seed-history.ts`,
 * `lib/demo/templates.ts`, `lib/demo/store.ts`) is plain TypeScript, not
 * React components, so it can't call `useLocale()`; reading the cookie
 * directly here avoids threading a `locale` parameter through every layer
 * between a component and these functions, and — more importantly — keeps
 * this file's needs to exactly one thing (know the language), instead of a
 * second copy of `i18n/request.ts`'s cookie-then-header-then-default
 * resolution (Accept-Language isn't available client-side anyway; a
 * visitor's language choice always reaches the browser as this cookie by
 * the time any demo code runs, since `/probar` never server-renders with
 * demo content — everything here executes after hydration).
 *
 * Client-only by construction (`isDemoMode()`, which every caller already
 * checks first, is itself client-only) — no `typeof window` guard needed
 * the way `lib/demo/store.ts`'s `localStorage` calls need one, since
 * `document` throws differently (and more loudly) than a missing
 * `localStorage` would if this were ever imported on the server by mistake.
 */
export function getDemoLocale(): Locale {
  return getClientLocale();
}

export { LOCALE_COOKIE };
