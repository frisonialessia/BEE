"use client";

import { useEffect, useState } from "react";

/**
 * How many rows of a given height fit in the box a list lives in — the
 * list rule that pairs with the chart rule in use-box-size: a Resumen list
 * never picks its own length, it shows exactly as many rows as its card
 * has room for, so a box is always full and never overflows. On phones the
 * grid rows are content-sized (a box is as tall as its list), so measuring
 * would only ever return "one row"; there the list falls back to `min`.
 *
 * The ref is a callback ref on purpose: these lists mount after a loading
 * state, so an effect that reads `ref.current` once at mount (use-box-size)
 * would find nothing and never measure. `rowHeight`/`gap` are the CSS
 * pixels one row and one gap take — the contract between the list markup
 * and this hook, keep them in sync.
 */
export function useRowCapacity<T extends HTMLElement>(rowHeight: number, gap: number, { min = 3, max = 12 } = {}) {
  const [node, setNode] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (!node) return;
    const read = () => setHeight(Math.round(node.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  const ref = (el: T | null) => setNode(el);
  if (!desktop || height <= 0) return [ref, min, desktop] as const;
  const fits = Math.floor((height + gap) / (rowHeight + gap));
  return [ref, Math.max(1, Math.min(max, fits)), desktop] as const;
}
