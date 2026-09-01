/**
 * Supported locales for BEE — single source of truth, imported by
 * `i18n/request.ts`, the locale server action, and the language switcher.
 *
 * There is deliberately no `[locale]` URL segment (see `i18n/request.ts`'s
 * docstring for the full rationale): every route stays exactly where it is
 * today (`/dashboard`, `/probar`, ...), and the active language is resolved
 * per-request from a cookie instead. Spanish stays the default — it's BEE's
 * primary market and every string in the codebase was written in Spanish
 * first, so a request with no cookie yet (first visit, or a client with
 * cookies disabled) must render exactly what already shipped, not silently
 * flip to English.
 */
export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

/** BCP-47 tag used for `Intl.*`/`next-intl` formatting — both currently map
 * 1:1 to the locale code, kept as its own export so a future regional
 * variant (e.g. `es-MX` vs `es-AR`) doesn't have to touch every call site. */
export const localeTags: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
