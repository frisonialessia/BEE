"use client";

import { Flame, Layers, TrendingUp, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/components/marketing-motion";

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
 * covering the headline. The examples are the same demo companies the
 * ticker and the Demo en vivo use — illustrative, never a real account.
 *
 * Parallax is JS-driven but purely additive: the CSS float runs on its
 * own, and with prefers-reduced-motion both the float (CSS) and the lean
 * (checked here) are off — the cards simply sit where they are.
 */

const CARDS = [
  { id: "funding", icon: TrendingUp, color: "var(--color-chart-1)", pos: "left-[-13.5rem] top-[14%]", depth: 1.3, delay: "0s" },
  { id: "hire", icon: UserPlus, color: "var(--color-chart-4)", pos: "right-[-13.5rem] top-[22%]", depth: 0.9, delay: "-2.3s" },
  { id: "stack", icon: Layers, color: "var(--color-chart-6)", pos: "left-[-12.5rem] bottom-[14%]", depth: 0.7, delay: "-4.1s" },
  { id: "intent", icon: Flame, color: "var(--color-chart-5)", pos: "right-[-12.5rem] bottom-[4%]", depth: 1.1, delay: "-5.6s" },
] as const;

export function MarketingHeroSignals() {
  const t = useTranslations("marketing.landing.heroSignals");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    // The whole hero section is the pointer field, not just the card
    // layer — the cards sit in the margins, so a pointer over the headline
    // still steers them.
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

  return (
    <div ref={ref} className="bee-hero-signals pointer-events-none absolute inset-0 hidden xl:block" aria-hidden>
      {CARDS.map((card) => (
        <div
          key={card.id}
          className={`bee-hero-signal absolute w-44 ${card.pos}`}
          style={{ "--depth": card.depth } as React.CSSProperties}
        >
          <div
            className="bee-hero-signal__float bee-glass flex items-center gap-2.5 rounded-[var(--radius-lg)] p-3"
            style={{ animationDelay: card.delay }}
          >
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
        </div>
      ))}
    </div>
  );
}
