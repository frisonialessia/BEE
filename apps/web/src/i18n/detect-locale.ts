import { isLocale, type Locale } from "@/i18n/locales";

/** Parses an `Accept-Language` header value and returns the first
 * subtag BEE actually supports, or `null` if none match (caller falls
 * back to `defaultLocale`). Shared between `i18n/request.ts` (resolves
 * the locale to render with, cookie → header → default) and `proxy.ts`
 * (persists that same header-derived choice as the `NEXT_LOCALE` cookie
 * on a visitor's very first request, so client-only code — the demo/
 * sandbox seed data, which can't call `next-intl`'s `useLocale()` —
 * agrees with what the server just rendered instead of defaulting to
 * Spanish until someone clicks the language switcher). Keep both call
 * sites' resolution order (cookie, then this) in sync if either changes. */
export function detectLocaleFromAcceptLanguage(acceptLanguage: string | null): Locale | null {
  const preferred = acceptLanguage
    ?.split(",")
    .map((part) => part.split(";")[0]?.trim().slice(0, 2).toLowerCase());
  const matched = preferred?.find((tag) => tag && isLocale(tag));
  return matched ? (matched as Locale) : null;
}
