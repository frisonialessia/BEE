"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures the box a chart lives in so the chart can fill it — width and
 * height in CSS pixels, updated by ResizeObserver. This is the rule behind
 * every chart in BEE: a chart never has a height of its own, it takes the
 * height of its card, so a row of cards stretched to the tallest one never
 * shows empty space under a chart. Text inside the SVG is drawn in real
 * pixels (1 viewBox unit = 1px), so labels keep the standard type size
 * instead of scaling with the box.
 *
 * Layout pixels, not painted ones: `offsetWidth/Height` and the observer's
 * `borderBoxSize` both ignore a CSS transform on an ancestor, while
 * getBoundingClientRect does not. Inside something scaled — the landing's
 * collage scales the whole cluster to fit the viewport — a rect-based
 * measurement handed the chart the *shrunken* size while the SVG was still
 * laid out at full size, so it drew a chart smaller than its box and
 * anchored to the top-left corner. Everywhere else the two agree, so this
 * is the same number it always was.
 */
export function useBoxSize<T extends HTMLElement>(fallback = { width: 600, height: 160 }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (entry?: ResizeObserverEntry) => {
      const box = entry?.borderBoxSize?.[0];
      const width = Math.round(box ? box.inlineSize : el.offsetWidth);
      const height = Math.round(box ? box.blockSize : el.offsetHeight);
      if (width > 0 && height > 0) setSize({ width, height });
    };
    read();
    const ro = new ResizeObserver(([entry]) => read(entry));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
