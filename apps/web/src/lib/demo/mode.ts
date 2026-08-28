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
