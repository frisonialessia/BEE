"use server";

import { cookies } from "next/headers";

import { isLocale, type Locale } from "@/i18n/locales";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/cookie";

/** Called from the language switcher (a client component) — writes the
 * `NEXT_LOCALE` cookie and lets the caller decide how to refresh (usually
 * `router.refresh()`, so every server component re-renders with the new
 * locale without a full page reload or losing client-side state like an
 * open dropdown). Validates against the known locale list rather than
 * trusting the string blindly, since this is reachable from the client. */
export async function setLocale(locale: Locale | string): Promise<void> {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
}
