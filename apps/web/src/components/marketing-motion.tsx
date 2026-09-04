"use client";

import { useEffect, useRef, useState } from "react";

import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

/**
 * marketing-motion — the small set of scroll-motion primitives the public
 * landing is built from (Reveal, CountUp, ScrollProgressBar, useScrollProgress),
 * so every section animates with the same timing (300–500 ms, ease-out,
 * never bouncy) instead of each component rolling its own.
 *
 * Every primitive is progressive enhancement, in this exact sense: the
 * HTML the server renders is the FINAL state (fully visible, real number,
 * full chart). Only after hydration, and only when the visitor has not
 * asked for reduced motion, does a component "arm" itself (hide, reset
 * to zero) and then play forward when it scrolls into view. So a visitor
 * with JS disabled, a crawler, a print preview or a reduced-motion user
 * all get the finished landing — never a page of blank cards waiting for
 * an animation that will not run. Nothing here uses Math.random(): the
 * server and the client must agree on the first render.
 */

export { useInView };

/** True when the visitor asked the OS/browser for less motion. Safe to
 *  call during SSR (returns false there — the CSS media query is the
 *  server-side half of the same guarantee). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type RevealState = "final" | "hidden" | "in" | "done";

/**
 * Shared state machine behind Reveal and the ad-hoc reveals (sales chart):
 *   final  → what the server renders: everything visible, no transition.
 *   hidden → armed after mount (JS + motion allowed): opacity 0, 12px low.
 *   in     → entered the viewport: transitions to visible.
 *   done   → transition over: classes drop away so the element's own hover
 *            transitions (bee-glass--hover etc.) get their timing back.
 */
export function useReveal<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  /** Total ms until "done" — should cover the longest staggered child. */
  settleMs?: number;
}) {
  const { threshold = 0.15, rootMargin = "0px 0px -40px 0px", settleMs = 1200 } = options ?? {};
  const { ref, inView } = useInView<T>({ threshold, rootMargin });
  const [state, setState] = useState<RevealState>("final");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    // Arm on the next frame, never synchronously in the effect — and only
    // once JS is provably running, so the server HTML stays fully visible.
    const raf = requestAnimationFrame(() => setState((s) => (s === "final" ? "hidden" : s)));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!inView) return;
    // Two frames so the "hidden" styles are committed before "in" starts
    // the transition (otherwise an element already in view at mount would
    // jump straight to visible with no motion at all).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setState((s) => (s === "hidden" ? "in" : s)));
    });
    const settle = window.setTimeout(() => setState((s) => (s === "in" ? "done" : s)), settleMs + 60);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settle);
    };
  }, [inView, settleMs]);

  return { ref, state };
}

/**
 * Reveal — fade + 12px rise when the element scrolls into view. With
 * `stagger`, the wrapper itself stays put and its direct children rise
 * one after another (80 ms apart, up to 8 — see .bee-reveal--stagger in
 * globals.css). `delay` offsets a single reveal, e.g. a subtitle under a
 * heading that is its own Reveal.
 */
export function Reveal({
  children,
  className,
  stagger = false,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  delay?: number;
  as?: "div" | "section" | "ul" | "li" | "p" | "header";
}) {
  const { ref, state } = useReveal<HTMLDivElement>({ settleMs: stagger ? 1400 : 700 });
  return (
    <Tag
      // The union of element tags makes the ref type awkward; every tag
      // here is an HTMLElement and the hook only reads geometry from it.
      ref={ref as React.Ref<never>}
      data-reveal={state}
      className={cn("bee-reveal", stagger && "bee-reveal--stagger", className)}
      style={delay ? ({ "--bee-reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/** "+46 k" → { prefix: "+", value: 46, decimals: 0, suffix: " k" }. Numbers
 *  in the landing copy are small and use "." only as a decimal separator
 *  (there is no thousands grouping in any counter), so the parse is
 *  deliberately simple; anything unparsable animates nothing and renders
 *  the text verbatim. */
export function parseCounter(text: string): { prefix: string; value: number; decimals: number; suffix: string } | null {
  const m = /^([^\d]*?)(\d+(?:[.,]\d+)?)(.*)$/.exec(text.trim());
  if (!m) return null;
  const numeric = m[2].replace(",", ".");
  const decimals = numeric.includes(".") ? numeric.split(".")[1].length : 0;
  const value = Number.parseFloat(numeric);
  if (!Number.isFinite(value)) return null;
  return { prefix: m[1], value, decimals, suffix: m[3] };
}

/**
 * CountUp — a number in the copy that counts up from 0 when it scrolls
 * into view, and ends on the copy's own string verbatim (so the value the
 * visitor reads is always exactly what the translation says). Takes the
 * text as written ("+46 k", "110 %", "128") and animates the numeric part
 * only. Server render and the final frame are both the original text.
 */
export function CountUp({
  text,
  duration = 1300,
  className,
}: {
  text: string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.4, rootMargin: "0px 0px -20px 0px" });
  const parsed = parseCounter(text);
  // null → show the real text; a number → mid-animation frame.
  const [current, setCurrent] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!parsed || prefersReducedMotion()) return;
    const raf = requestAnimationFrame(() => {
      setArmed(true);
      setCurrent(0);
    });
    return () => cancelAnimationFrame(raf);
    // `parsed` is derived from `text`; re-arming on text change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (!armed || !inView || !parsed) return;
    const target = parsed.value;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic — settles, never overshoots
      if (k >= 1) {
        setCurrent(null); // hand back to the literal copy
        return;
      }
      setCurrent(target * eased);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, inView, text, duration]);

  let label = text;
  if (parsed && current !== null) {
    const useComma = /\d,\d/.test(text);
    const num = current.toFixed(parsed.decimals);
    label = `${parsed.prefix}${useComma ? num.replace(".", ",") : num}${parsed.suffix}`;
  }

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {label}
    </span>
  );
}

/**
 * ScrollProgressBar — 2px indigo→magenta line along the very top of the
 * sticky header that fills with page progress. Uses CSS scroll-driven
 * animation (`animation-timeline: scroll()`) where the browser has it —
 * zero JS on the scroll path — and a passive, rAF-throttled scroll
 * listener everywhere else.
 */
export function ScrollProgressBar() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: scroll()")) {
      el.dataset.native = "true";
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="bee-scroll-progress" aria-hidden>
      <div ref={ref} className="bee-scroll-progress__bar" />
    </div>
  );
}

/**
 * useScrollProgress — 0..1 for how far the visitor has scrolled through a
 * section. Two regimes, chosen from the live CSS rather than a JS media
 * query so it can never disagree with the stylesheet:
 *
 *  - pinned (the inner `pin` element is `position: sticky`, i.e. the lg
 *    layout of the story section): progress is the pin's travel inside
 *    the tall section — 0 the moment it sticks, 1 when it unsticks.
 *  - flowing (mobile/tablet, no sticky): progress is how much of the
 *    section has crossed a line 85% down the viewport, so the last step
 *    lights up as the section's end scrolls past that line.
 *
 * Returns `null` until first measured — callers render the final state
 * for null, which is also what the server renders.
 */
export function useScrollProgress<TSection extends HTMLElement, TPin extends HTMLElement>() {
  const sectionRef = useRef<TSection>(null);
  const pinRef = useRef<TPin>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const pin = pinRef.current;
      let p: number;
      if (pin && getComputedStyle(pin).position === "sticky" && rect.height - pin.offsetHeight > 40) {
        const pinRect = pin.getBoundingClientRect();
        p = (pinRect.top - rect.top) / (rect.height - pinRect.height);
      } else {
        p = (vh * 0.85 - rect.top) / Math.max(rect.height, 1);
      }
      setProgress(Math.min(1, Math.max(0, p)));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { sectionRef, pinRef, progress };
}
