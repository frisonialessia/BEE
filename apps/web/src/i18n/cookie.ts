/** Shared between the server action that writes it (`i18n/actions.ts`) and
 * the request config that reads it (`i18n/request.ts`) — kept as its own
 * module (not inlined in either) since both `next/headers` (server-only)
 * and a `"use server"` action file can import a plain string constant
 * without pulling in anything server-only themselves. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** ~1 year — a language choice is a long-lived preference, not a session
 * value; there's no session concept for it to expire alongside (the JWT in
 * `lib/auth-storage.ts` is unrelated and lives in localStorage, not a
 * cookie — this is genuinely the first cookie this app sets). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
