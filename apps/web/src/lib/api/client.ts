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
  const { next, headers, ...rest } = options;
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...rest,
    headers: buildApiHeaders(headers),
    ...(next !== undefined ? { next } : {}),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => undefined);
    const message =
      typeof detail === "object" &&
      detail !== null &&
      "detail" in detail &&
      typeof (detail as { detail: unknown }).detail === "string"
        ? (detail as { detail: string }).detail
        : `API error ${res.status}`;
    throw new ApiError(message, res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
