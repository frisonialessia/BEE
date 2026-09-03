import { usePathname } from "next/navigation";

/**
 * Demo sandbox mode — `/probar` and everything under it.
 *
 * A visitor on `/probar` never registers or logs in, so there is no real
 * session and nothing they do should ever reach the real API or Supabase.
 * Rather than fork the UI, the same dashboard components (`CrmBoard`,
 * `SignalsDashboard`, the opportunity drawer…) run unmodified — only the
 * functions in `lib/api/*` are demo-aware: when `isDemoMode()` is true they
 * read/write `lib/demo/store` (browser `localStorage`) instead of calling
 * the real backend. Nothing under `/probar` is a special build; it's the
 * real product pointed at a local-only dataset.
 *
 * Detecting demo mode by URL (rather than a flag some provider sets) means
 * there's no state to leak across route changes or to get out of sync —
 * it's always exactly what the current page is.
 */
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/probar");
}

/**
 * Same check as `isDemoMode()`, for use inside a component's render body
 * instead of a `lib/api/*` call — `isDemoMode()` reads `window.location`
 * directly, which doesn't exist during the server render pass and always
 * resolves to `false` there; if a component uses that result to decide
 * *which* elements to render (an extra button, a `<div>` vs. a `<Link>`),
 * the server and client trees come out structurally different and React
 * throws a hydration mismatch (#418) on every load. `usePathname()` comes
 * from Next's own router state instead of `window`, so it resolves to the
 * same `/probar/...` path on both the server render and the client one —
 * no mismatch. Only worth the extra hook when the result gates *what*
 * renders, not just a value inside already-identical markup. */
export function useIsDemoMode(): boolean {
  return (usePathname() ?? "").startsWith("/probar");
}

/** Base path for in-app links rendered by components shared between the real
 *  dashboard and the sandbox — `/probar` there, `/dashboard` everywhere else —
 *  so a "Ver más" inside the sandbox never bounces a visitor to the login. */
export function useDashboardBase(): "/probar" | "/dashboard" {
  return useIsDemoMode() ? "/probar" : "/dashboard";
}
