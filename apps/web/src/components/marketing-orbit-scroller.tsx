"use client";

/**
 * OrbitScroller — the horizontally-scrollable strip MarketingOrbit's
 * fanned cards live in, split into its own client component only because
 * centering the initial scroll position needs a ref + effect (the rest of
 * MarketingOrbit stays a server component — no other part of it needs
 * client state).
 *
 * On a narrow viewport the fanned cards are wider than the screen, and a
 * plain scrollable div starts at scrollLeft=0 — the LEFT edge of the
 * (horizontally centered-by-flex) content, not its visual center. That
 * showed the first card at the left edge, sliced the middle ones, and put
 * the last card fully off-screen with no hint it existed (see the actual
 * bug report: only 3 of 4 cards visible, the 3rd cut in half, nothing
 * suggesting you could scroll for the 4th). Centering scrollLeft on mount
 * — `(scrollWidth - clientWidth) / 2` — starts the visitor looking at the
 * middle of the fan with a genuine partial card peeking in on both sides,
 * the standard "there's more, swipe either way" affordance a carousel
 * needs. A no-op when the content already fits (scrollWidth ===
 * clientWidth, e.g. desktop) — nothing to center.
 */

import { useEffect, useRef } from "react";

export function OrbitScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  return (
    <div
      ref={ref}
      className="overflow-x-auto px-4 py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
