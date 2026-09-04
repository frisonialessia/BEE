"use client";

import { Flame, Layers, TrendingUp, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { clamp01, easeOutCubic, onScrollFrame, prefersReducedMotion, smoothstep } from "@/components/marketing-motion";

/**
 * MarketingHeroSignals — the four kinds of market signal BEE watches
 * (funding round · key hire · tech-stack change · intent spike) as small
 * white cards floating around the headline, the way app icons orbit a
 * product name on a launch page. Each drifts on its own CSS float loop
 * and leans toward the pointer (and drifts with scroll) at a different
 * depth, so the hero reads as alive without a single new background fill.
 *
 * Only at xl and up: the cards live in the side margins of the max-w-4xl
 * text column, and below 1280px there is no margin to put them in without
 * covering the headline. Positions keep clear of the sticky header above
 * and of the tilted module cards below. The examples are the same demo
 * companies the ticker and the Demo en vivo use — illustrative, never a
 * real account.
 *
 * Hero → dashboard morph: as the visitor scrolls from the hero into
 * #producto, the cards fly into the Demo en vivo panel and become its
 * columns. FLIP-style and transform-only: the hero cards themselves stay
 * put (the hero has overflow:hidden), and a fixed, pointer-events-none
 * layer draws four identical "ghosts" whose translate/scale is scrubbed
 * by scroll from each card's live rect to its target column's rect
 * ([data-morph-target] in the Señales tab, falling back to thirds of the
 * panel). p = scrollY / D where D is the scroll that brings the panel's
 * top to 30 % of the viewport — so at p 0 the ghost is exactly the card,
 * and at p 1 it has landed on a visible panel and faded out. Degrades to
 * "cards simply fade out" when the panel is missing/too close (short
 * pages, tall viewports) and does nothing below xl (no cards) or under
 * prefers-reduced-motion.
 */

const CARDS = [
  { id: "funding", icon: TrendingUp, color: "var(--color-chart-1)", pos: "left-[-13.5rem] top-[14%]", depth: 1.3, delay: "0s", col: 1, y: 0 },
  { id: "hire", icon: UserPlus, color: "var(--color-chart-4)", pos: "right-[-13.5rem] top-[22%]", depth: 0.9, delay: "-2.3s", col: 3, y: 0 },
  { id: "stack", icon: Layers, color: "var(--color-chart-6)", pos: "left-[-12.5rem] bottom-[14%]", depth: 0.7, delay: "-4.1s", col: 2, y: 0.62 },
  { id: "intent", icon: Flame, color: "var(--color-chart-5)", pos: "right-[-12.5rem] bottom-[4%]", depth: 1.1, delay: "-5.6s", col: 2, y: 0.28 },
] as const;

type Card = (typeof CARDS)[number];

function SignalCard({ card, className }: { card: Card; className: string }) {
  const t = useTranslations("marketing.landing.heroSignals");
  return (
    <div className={`bee-glass flex items-center gap-2.5 rounded-[var(--radius-lg)] p-3 ${className}`}>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${card.color} 22%, white)`, color: `color-mix(in srgb, ${card.color} 80%, var(--color-text) 20%)` }}
      >
        <card.icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-micro font-semibold uppercase tracking-wide" style={{ color: `color-mix(in srgb, ${card.color} 75%, var(--color-text) 25%)` }}>
          {t(`${card.id}.label`)}
        </span>
        <span className="block truncate text-xs font-medium leading-snug text-foreground">{t(`${card.id}.detail`)}</span>
      </span>
    </div>
  );
}

export function MarketingHeroSignals() {
  const ref = useRef<HTMLDivElement>(null);
  const ghostsRef = useRef<HTMLDivElement>(null);

  // Pointer lean + scroll drift (per-card depth).
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const field: HTMLElement = el.closest("section") ?? el;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const paint = () => {
      raf = 0;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
      el.style.setProperty("--sy", `${Math.min(window.scrollY, 600).toFixed(0)}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMove = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      schedule();
    };
    const onLeave = () => {
      mx = 0;
      my = 0;
      schedule();
    };
    field.addEventListener("pointermove", onMove, { passive: true });
    field.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Hero → dashboard morph (see the docblock).
  useEffect(() => {
    const layer = ref.current;
    const ghosts = ghostsRef.current;
    if (!layer || !ghosts || prefersReducedMotion()) return;
    const cardEls = Array.from(layer.querySelectorAll<HTMLElement>(".bee-hero-signal__float"));
    const ghostEls = Array.from(ghosts.querySelectorAll<HTMLElement>(".bee-hero-ghost"));
    const reset = () => {
      layer.style.visibility = "";
      layer.style.opacity = "";
      ghosts.removeAttribute("data-active");
    };
    const cleanup = onScrollFrame(() => {
      if (getComputedStyle(layer).display === "none") {
        reset();
        return;
      }
      const panel = document.querySelector<HTMLElement>("[data-morph-panel]");
      const vh = window.innerHeight;
      const sy = window.scrollY;
      const panelRect = panel?.getBoundingClientRect();
      const travel = panelRect ? panelRect.top + sy - vh * 0.3 : 0;
      if (!panel || !panelRect || travel < 240) {
        // Degraded mode: no flight, the cards just fade as the hero leaves.
        ghosts.removeAttribute("data-active");
        layer.style.visibility = "";
        layer.style.opacity = (1 - clamp01(sy / 320)).toFixed(3);
        return;
      }
      const p = clamp01(sy / travel);
      if (p <= 0) {
        reset();
        return;
      }
      layer.style.opacity = "";
      layer.style.visibility = "hidden";
      if (p >= 1) {
        ghosts.removeAttribute("data-active");
        return;
      }
      ghosts.setAttribute("data-active", "");
      const e = easeOutCubic(p);
      const fade = 1 - smoothstep(0.72, 1, p);
      CARDS.forEach((card, i) => {
        const src = cardEls[i]?.getBoundingClientRect();
        const ghost = ghostEls[i];
        if (!src || !ghost) return;
        const target = panel.querySelector<HTMLElement>(`[data-morph-target="${card.col}"]`)?.getBoundingClientRect();
        const colW = panelRect.width / 3;
        const tLeft = target ? target.left : panelRect.left + colW * (card.col - 1);
        const tTop = target ? target.top : panelRect.top;
        const tW = target ? target.width : colW;
        const tH = target ? target.height : panelRect.height;
        const scale = 1 + Math.min(0.35, tW / src.width - 1) * e;
        const dx = tLeft + 16 - src.left;
        const dy = tTop + 16 + tH * card.y - src.top;
        ghost.style.width = `${src.width.toFixed(1)}px`;
        ghost.style.transform = `translate3d(${(src.left + dx * e).toFixed(1)}px, ${(src.top + dy * e).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        ghost.style.opacity = fade.toFixed(3);
      });
    });
    return () => {
      cleanup();
      reset();
    };
  }, []);

  return (
    <>
      <div ref={ref} className="bee-hero-signals pointer-events-none absolute inset-0 hidden xl:block" aria-hidden>
        {CARDS.map((card) => (
          <div key={card.id} className={`bee-hero-signal absolute w-44 ${card.pos}`} style={{ "--depth": card.depth } as React.CSSProperties}>
            <div className="bee-hero-signal__float" style={{ animationDelay: card.delay }}>
              <SignalCard card={card} className="" />
            </div>
          </div>
        ))}
      </div>
      {/* Flight layer for the hero → dashboard morph: fixed, under the
       * header (z-35 < z-40), shown only while a flight is in progress. */}
      <div ref={ghostsRef} className="bee-hero-ghosts" aria-hidden>
        {CARDS.map((card) => (
          <div key={card.id} className="bee-hero-ghost">
            <SignalCard card={card} className="" />
          </div>
        ))}
      </div>
    </>
  );
}
