"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { useTour } from "@/features/tour/tour-context";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HIGHLIGHT_PADDING = 6;

function measure(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * The actual highlight-ring + spotlight-dim + tooltip renderer for the
 * guided tour (see tour-context.tsx for the state machine, tour-steps.ts
 * for the content). Mount once per shell layout — dashboard/layout.tsx
 * and app/probar/layout.tsx both do, right next to the other
 * always-on-top overlays (AskBeeFab, OpportunityDrawer).
 *
 * Every step's target is always-mounted chrome (a nav rail link, the
 * account menu trigger, the sandbox's "Crear cuenta" button) — never
 * page content that loads asynchronously — so there's no need for a
 * MutationObserver/retry loop to wait for it to appear; it's already in
 * the DOM the moment this component itself is.
 */
export function TourOverlay() {
  const tour = useTour();
  const pathname = usePathname();
  const router = useRouter();
  const [rect, setRect] = useState<Rect | null>(null);
  const lastNavigatedTarget = useRef<string | null>(null);

  const { active, step } = tour;

  // Navigate to the step's page exactly once per step change — not on
  // every pathname change, so freely browsing away mid-tour doesn't get
  // yanked back (see module docstring above for why this needs a ref,
  // not just a [step] dependency).
  useEffect(() => {
    if (!active || !step) {
      lastNavigatedTarget.current = null;
      return;
    }
    if (lastNavigatedTarget.current === step.target) return;
    lastNavigatedTarget.current = step.target;
    if (step.href && step.href !== pathname) {
      router.push(step.href);
    }
  }, [active, step, pathname, router]);

  // Re-measure on step change, and keep it correct across resize/scroll
  // (the rail's own nav list scrolls independently on a tall menu) —
  // capture:true on the scroll listener catches scrolling inside nested
  // containers, not just the window itself.
  useEffect(() => {
    // No need to explicitly clear `rect` here when the tour goes inactive
    // or between steps — the render guard below already bails out on
    // `!active || !step` before `rect` is ever read, so a stale value
    // sitting unused in state is harmless (and setting it here would just
    // be an extra synchronous setState in the effect body for nothing).
    if (!active || !step) return;

    function recompute() {
      if (step) setRect(measure(step.target));
    }

    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [active, step, pathname]);

  if (!active || !step || !rect) return null;

  const box = {
    top: rect.top - HIGHLIGHT_PADDING,
    left: rect.left - HIGHLIGHT_PADDING,
    width: rect.width + HIGHLIGHT_PADDING * 2,
    height: rect.height + HIGHLIGHT_PADDING * 2,
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {/* Spotlight dim — four rectangles framing the highlight box instead
         of an SVG mask, cheaper and just as correct for an axis-aligned
         cutout. */}
      <div className="fixed inset-x-0 top-0 bg-black/45" style={{ height: Math.max(0, box.top) }} />
      <div
        className="fixed inset-x-0 bottom-0 bg-black/45"
        style={{ top: box.top + box.height }}
      />
      <div
        className="fixed bg-black/45"
        style={{ top: box.top, height: box.height, left: 0, width: Math.max(0, box.left) }}
      />
      <div
        className="fixed bg-black/45"
        style={{ top: box.top, height: box.height, left: box.left + box.width, right: 0 }}
      />

      {/* Highlight ring */}
      <div
        className="fixed rounded-[var(--radius-md)] ring-2 ring-[var(--color-chart-4)] transition-all duration-200"
        style={{
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          boxShadow: "0 0 0 4px color-mix(in srgb, var(--color-chart-4) 30%, transparent)",
        }}
      />

      <TourTooltip box={box} />
    </div>
  );
}

function TourTooltip({ box }: { box: Rect }) {
  const { step, stepIndex, totalSteps, next, back, stop } = useTour();
  const t = useTranslations("onboarding.tour.overlay");
  if (!step) return null;

  const isLast = stepIndex + 1 >= totalSteps;
  const isFirst = stepIndex === 0;

  // Rail steps point right (the rail sits on the left edge); the closing
  // step's target lives in the top-right header chrome, so it points
  // left instead — see TourStep.placement's own doc comment.
  const placement = step.placement;
  const style: React.CSSProperties =
    placement === "right"
      ? { top: box.top, left: box.left + box.width + 16 }
      : { top: box.top + box.height + 12, right: Math.max(16, window.innerWidth - box.left - box.width) };

  return (
    <div
      className="pointer-events-auto fixed w-[min(320px,calc(100vw-2.5rem))] space-y-3 rounded-[var(--radius-lg)] border border-border bg-[var(--color-background)] p-4 shadow-[0_12px_40px_color-mix(in_srgb,var(--color-text)_20%,transparent)]"
      style={style}
      role="dialog"
      aria-label={t("dialogAriaLabel")}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-chart-4)] px-3 py-1 text-micro font-semibold uppercase tracking-wide text-white">
          {t("badge")}
          <span className="opacity-80">
            {stepIndex + 1}/{totalSteps}
          </span>
        </span>
        <button
          type="button"
          onClick={stop}
          aria-label={t("closeAriaLabel")}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-[var(--color-primary)] hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold">{step.title}</p>
        <p className="bee-caption mt-1 leading-relaxed">{step.description}</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={stop}
          className="bee-micro text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("skip")}
        </button>
        <div className="flex gap-2">
          {!isFirst && (
            <button type="button" onClick={back} className="bee-btn-ghost px-3 py-2 text-xs">
              {t("back")}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="bee-btn bee-btn--primary px-3 py-2 text-xs"
          >
            {isLast ? t("done") : t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}
