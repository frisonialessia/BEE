/**
 * Session token storage — a thin wrapper over localStorage.
 *
 * Guarded for SSR: Next.js renders this module on the server too, where
 * `window`/`localStorage` don't exist. Every function is a no-op (or returns
 * null) outside the browser rather than throwing, so importing this file
 * never breaks a server render.
 */

const TOKEN_KEY = "bee.auth.token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing / disabled storage — degrade to "logged out".
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore — worst case the session doesn't persist across reloads.
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore.
  }
}
