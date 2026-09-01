"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Resets a scrollable container back to the top on every route change.
 *
 * Next.js's built-in scroll restoration only manages the window/document
 * scroll position — it has no idea `.bee-scroll` (the dashboard/`/probar`
 * content pane) is its own independent scroll container, so it never
 * touches it. Without this, clicking a sidebar link while scrolled down on
 * e.g. Empresas lands you on Prioridad already scrolled to that same pixel
 * offset — a fresh page that opens mid-scroll reads as broken, not as
 * "natural" navigation, which is exactly the effect a sidebar tab switch
 * should have (arrive at the top of the new view, like a new tab).
 */
export function useScrollResetOnNavigate<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return ref;
}
