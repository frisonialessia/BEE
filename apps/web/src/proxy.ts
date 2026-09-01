import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/cookie";
import { detectLocaleFromAcceptLanguage } from "@/i18n/detect-locale";

/**
 * Renamed from `middleware.ts` in Next.js 16 — "the functionality remains
 * the same" (see `node_modules/next/dist/docs/.../proxy.md`).
 *
 * The one job this does: persist a first-time visitor's browser-language
 * preference as the `NEXT_LOCALE` cookie, the same cookie the language
 * switcher writes via `i18n/actions.ts`'s `setLocale()`.
 *
 * `i18n/request.ts` already resolves cookie → `Accept-Language` → Spanish
 * for what to *render* — an English-browser visitor gets English UI chrome
 * on their very first request even with no cookie yet. But that resolution
 * happens inside `getRequestConfig`, which runs during Server Component
 * rendering — `cookies().set()` isn't allowed there (Next.js: "Setting
 * cookies is not supported during Server Component rendering"), so nothing
 * ever wrote that header-derived choice back to the cookie. The demo/
 * sandbox seed data (`lib/demo/locale.ts`'s `getDemoLocale()` — plain
 * TypeScript, not a component, so it can't call `useLocale()`) only ever
 * reads the cookie, defaulting to Spanish when it's absent. Net effect
 * before this file existed: an English-browser visitor to `/probar` saw
 * English UI chrome over Spanish demo data (signal titles, battlecard pain
 * points, ...) until they clicked the language switcher themselves.
 *
 * A proxy response CAN set cookies (unlike a Server Component render), so
 * this runs once, before rendering, and only when there's no cookie yet —
 * an explicit choice already on the cookie is never touched here.
 */
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (request.cookies.has(LOCALE_COOKIE)) return response;

  const detected = detectLocaleFromAcceptLanguage(request.headers.get("accept-language"));
  if (!detected) return response;

  response.cookies.set(LOCALE_COOKIE, detected, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // Same "everything except Next's own internals and static assets" shape
  // as the framework's own example matcher — this cookie is relevant to
  // every page, not a specific section, but must never intercept
  // `_next/*`, the favicon, or files under `public/`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
