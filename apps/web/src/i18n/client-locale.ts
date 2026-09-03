import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";
import { LOCALE_COOKIE } from "@/i18n/cookie";

/**
 * The visitor's current language, read straight from the `NEXT_LOCALE`
 * cookie — for plain TypeScript modules (the API client, the demo data
 * layer) that can't call `useLocale()`. Same cookie `i18n/request.ts`
 * resolves server-side; by the time any client-only code runs, an explicit
 * or header-derived choice is already on it (see `proxy.ts`). Falls back
 * to the default locale on the server or when no cookie is set.
 */
export function getClientLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value && isLocale(value) ? value : defaultLocale;
}
