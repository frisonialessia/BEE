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
 */
export function useBoxSize<T extends HTMLElement>(fallback = { width: 600, height: 160 }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
