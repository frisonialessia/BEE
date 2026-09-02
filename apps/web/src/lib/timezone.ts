/**
 * IANA timezone helpers backing User.timezone (self-service profile setting,
 * see team-admin-view.tsx's MyProfileSection) and every place a meeting time
 * gets formatted for display (calendar-page.tsx, my-calendar-widget.tsx).
 *
 * Every meeting time is stored as an absolute UTC instant
 * (Meeting.starts_at) — nothing here changes that. This only decides which
 * timezone the *current viewer's own browser* renders it in: their own
 * `timezone` profile field when they've set one, or their browser's
 * detected zone otherwise. Because that resolution happens fresh on every
 * render off the logged-in user's own record, changing the setting (or a
 * teammate changing theirs) takes effect immediately for whoever it
 * belongs to — no caching, no stale conversion left over from before.
 */

/** The viewer's own browser-detected IANA zone — the default shown before
 *  they've explicitly picked one. */
export function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** The zone to actually format a date in for this user: their explicit
 *  choice if they made one, their browser's own zone otherwise. */
export function resolveTimezone(userTimezone: string | null | undefined): string {
  return userTimezone || detectedTimezone();
}

/** A Date whose *local* getters (getHours, getDay, getMonth, toDateString,
 *  …) report `date`'s wall-clock time in `timeZone` — not the browser's own
 *  zone. The classic "fake-local-date" trick: read the instant's
 *  components in the target zone via Intl, then hand those same numbers to
 *  the plain local Date constructor. The result's getTime()/toISOString()
 *  no longer mean the real instant — only use it for local-getter reads
 *  (calendar-page.tsx's hour-grid positioning and day bucketing), never to
 *  send a timestamp anywhere. */
export function zonedFakeLocalDate(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // hour12:false can report "24" for midnight on some engines — normalize.
  const hour = get("hour") % 24;
  return new Date(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/** The real UTC instant for a wall-clock time (`month` is 0-based, matching
 *  Date's own convention) meant *in* `timeZone` — the reverse of
 *  zonedFakeLocalDate, used when a form's datetime-local input should be
 *  interpreted in the user's chosen zone rather than the browser's own.
 *  One correction pass: guess the instant as if the wall clock were UTC,
 *  see what that guess actually maps to in the target zone, and shift by
 *  the difference — exact for every real-world zone outside the instant a
 *  DST transition itself starts. */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guessUtcMs = Date.UTC(year, month, day, hour, minute, 0);
  const mapped = zonedFakeLocalDate(new Date(guessUtcMs), timeZone);
  const mappedAsUtcMs = Date.UTC(
    mapped.getFullYear(),
    mapped.getMonth(),
    mapped.getDate(),
    mapped.getHours(),
    mapped.getMinutes(),
    mapped.getSeconds(),
  );
  return new Date(guessUtcMs + (guessUtcMs - mappedAsUtcMs));
}

/** Every IANA zone the runtime knows about (Intl.supportedValuesOf, which
 *  every evergreen browser implements) for the profile picker's <select>.
 *  Falls back to a short list of major zones on a runtime without it,
 *  always including whatever the browser itself resolved to so the
 *  picker's default value is never missing from its own option list. */
export function availableTimezones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      // fall through to the curated list below
    }
  }
  const fallback = [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Mexico_City",
    "America/Bogota",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Madrid",
    "Europe/Paris",
    "Europe/Berlin",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
  const detected = detectedTimezone();
  return fallback.includes(detected) ? fallback : [detected, ...fallback];
}
