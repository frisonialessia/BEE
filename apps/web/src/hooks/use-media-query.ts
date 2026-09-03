"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query from a component. Always `false` on the
 * server and on the first client render (so server/client markup match —
 * no hydration mismatch), then tracks the real value. Use only for
 * details that are fine to settle one frame after hydration (a shorter
 * placeholder, a compact label), never for anything layout-critical —
 * that belongs in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    // Sync once on mount, then follow changes. The eslint rule is about
    // cascading renders; this is the one initial read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
