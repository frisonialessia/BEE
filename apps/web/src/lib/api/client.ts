import { ApiError } from "@/types/api";
import { getPublicEnv } from "@/lib/env";
import { getStoredToken } from "@/lib/auth-storage";

export function getApiBaseUrl(): string {
  return getPublicEnv().NEXT_PUBLIC_API_URL.replace(/\/$/, "");
}

/**
 * Build default headers for BEE API requests: X-API-Key when configured
 * (service-level auth, shared by every browser session), plus an
 * Authorization bearer token when the caller is logged in (per-user session
 * — see app.core.security on the backend). Both can be present at once; the
 * backend treats them as independent trust boundaries.
 */
export function buildApiHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const apiKey = getPublicEnv().NEXT_PUBLIC_BEE_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(extra)) {
      for (const [key, value] of extra) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, extra);
    }
  }

  return headers;
}

export interface ApiFetchOptions extends RequestInit {
  /** Next.js fetch cache hint (server components). */
  next?: { revalidate?: number | false; tags?: string[] };
}

/**
 * Typed fetch wrapper for the BEE API.
 * Throws {@link ApiError} on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  // NEXT_PUBLIC_API_URL falling back to localhost:8000 is a real
  // convenience in development — `pnpm dev` needs zero .env.local setup
  // against a locally running API. Silently keeping that same fallback for
  // a real visitor's browser in production would mean this specific call
  // targets localhost:8000 — which can't reach the real API, and (worse)
  // would happily talk to anything the *visitor's own machine* happens to
  // have listening on that port. Checked here — immediately before the one
  // place a live network call actually happens — rather than in
  // getPublicEnv()/getApiBaseUrl() themselves: those are also called from
  // module-level code and display-only URL builders that run on every page
  // load regardless of whether a real request is ever made, including the
  // sandbox (`/probar`), which by design never calls the real API at all
  // (see `lib/demo/mode.ts`) and must never be taken down by this check.
  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    !process.env.NEXT_PUBLIC_API_URL
  ) {
    // This throw happens before fetch() is ever called — nothing hits the
    // Network tab, and (previously) nothing hit the Console either, which
    // made a misconfigured *deployment* indistinguishable from a real API
    // failure to whoever was looking. It has a known real-world cause: a
    // second/stale Vercel project auto-deploying the same repo (a
    // duplicate created before this project was renamed, still connected
    // to GitHub) without NEXT_PUBLIC_API_URL configured on *it* — so
    // logging window.location.origin here is what tells you that's what
    // happened, instead of re-checking the right project's env vars over
    // and over while the wrong project silently eats every request.
    console.error(
      `[BEE API] NEXT_PUBLIC_API_URL is not set on this deployment ` +
        `(origin: ${window.location.origin}). If the correct Vercel project ` +
        `has this configured, you are probably looking at a different, stale ` +
        `deployment/domain — check Vercel for a duplicate project still ` +
        `auto-deploying this same repo without the env var set.`,
    );
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it in the production environment " +
        "(e.g. Vercel project settings) — it cannot silently default to localhost:8000 " +
        "outside of local development.",
    );
  }

  const { next, headers, ...rest } = options;
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: buildApiHeaders(headers),
      ...(next !== undefined ? { next } : {}),
    });
  } catch (err) {
    // fetch() itself throwing (as opposed to resolving with a non-2xx
    // response, handled below) means the request never reached the API at
    // all — a CORS rejection, DNS failure, or the API being unreachable.
    // Every caller in this codebase catches ApiError and falls back to
    // `err instanceof ApiError ? err.message : <generic fallback>` (see
    // e.g. app/register/page.tsx) — without this, that branch collapses a
    // CORS misconfiguration, a wrong NEXT_PUBLIC_API_URL, and a real
    // backend outage into the exact same opaque string, with the actual
    // browser error (which names the real cause) never logged anywhere a
    // person would think to look. Logging it here, once, at the one choke
    // point every API call passes through, means the real cause is always
    // one DevTools Console open away instead of a support investigation.
    console.error(
      `[BEE API] Request to ${url} failed before a response was received ` +
        `— likely CORS (check BACKEND_CORS_ORIGINS on the API includes this ` +
        `site's exact origin, no trailing slash), a wrong NEXT_PUBLIC_API_URL, ` +
        `or the API being unreachable. Underlying error:`,
      err,
    );
    throw new ApiError(
      "No se pudo conectar con el servidor. Intenta de nuevo en un momento.",
      0,
      err,
    );
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => undefined);
    const message =
      typeof detail === "object" &&
      detail !== null &&
      "detail" in detail &&
      typeof (detail as { detail: unknown }).detail === "string"
        ? (detail as { detail: string }).detail
        : `API error ${res.status}`;

    // A 401 while a session token was actually being sent means that
    // specific token is dead (expired, or the user got deactivated
    // server-side) — not "this call happens to be anonymous". Every
    // fetch* caller in this codebase individually catches ApiError and
    // quietly degrades (empty list, cached demo data) — nothing ever told
    // the person their session died, so the dashboard just silently
    // stopped updating. Broadcast it once here so a single top-level
    // listener (AuthProvider) can react uniformly instead of every caller
    // reinventing that check. Guarded on `getStoredToken()` at the moment
    // of the response (not just "status is 401") so this never fires for
    // an intentionally-anonymous call (e.g. a login attempt with the wrong
    // password, which 401s too but has no stored token to invalidate).
    if (res.status === 401 && typeof window !== "undefined" && getStoredToken()) {
      window.dispatchEvent(new CustomEvent("bee:session-expired"));
    }

    throw new ApiError(message, res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
