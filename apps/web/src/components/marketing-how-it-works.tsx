"use client";

import { Check, CheckCircle2, Radio, Sparkles, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { MarketingHoneycomb } from "@/components/marketing-honeycomb";
import { clamp01, easeOutCubic, onScrollFrame, prefersReducedMotion, smoothstep, useScrollProgress } from "@/components/marketing-motion";

/**
 * MarketingHowItWorks — the "señal → jugada → cierre" scroll story. The
 * 4 steps of the real pipeline (signal engine → enrichment/scoring →
 * suggested play → human approval, the same order GUARANTEES and MODULES
 * in app/page.tsx describe) laid out as a pinned sequence: on lg+ the
 * section is tall and its content sticks while the visitor scrolls
 * through it, and scroll position drives everything — which step is lit,
 * how far the honey → indigo → magenta track has filled, how much of the
 * hive glows, and which event chips have landed on the stage at the
 * right (one per step, all drawn from the same Northwind Robotics example
 * the Demo en vivo uses). Below lg nothing pins: the section flows and
 * progress is simply how far it has scrolled past the viewport, so the
 * steps still light up in order on a phone.
 *
 * `progress` is null until the client measures once — and null renders
 * the FINAL state (every step lit, track full, hive on, all chips
 * shown), which is therefore also what the server sends: a visitor
 * without JS reads the complete four steps, not a dimmed list waiting
 * for a scroll handler.
 *
 * The ticker "catches" a signal (lg+ only): as this section scrolls in,
 * a ghost of the ticker's first item — the very same Northwind Series C
 * line — detaches from the ticker band ([data-ticker-band], measured
 * live, usually far above the viewport by then) and floats down onto the
 * first stage chip; when it lands the chip appears. Transform-only on a
 * fixed layer under the header; `caught` is null whenever the feature is
 * off (server, below lg, reduced motion, no ticker), in which case the
 * first chip follows the normal rule.
 */

const STEPS = [
  { id: "detect", icon: Radio, color: "var(--color-chart-1)" },
  { id: "enrich", icon: Sparkles, color: "var(--color-chart-2)" },
  { id: "prepare", icon: Target, color: "var(--color-chart-4)" },
  { id: "approve", icon: CheckCircle2, color: "var(--color-chart-5)" },
] as const;

// Where along 0..1 each step becomes the active one. The last step owns
// the tail so the visitor finishes the story on "tú apruebas".
const STEP_STARTS = [0, 0.27, 0.54, 0.8] as const;

function activeIndex(progress: number | null): number {
  if (progress === null) return STEPS.length - 1;
  let idx = 0;
  for (let i = 0; i < STEP_STARTS.length; i++) if (progress >= STEP_STARTS[i]) idx = i;
  return idx;
}

export function MarketingHowItWorks() {
  const t = useTranslations("landing.howItWorks");
  const tTicker = useTranslations("landing.ticker");
  const caughtText = (tTicker.raw("items") as string[])[0];
  const { sectionRef, pinRef, progress } = useScrollProgress<HTMLElement, HTMLDivElement>();
  const active = activeIndex(progress);
  const measured = progress !== null;
  const trackFill = measured ? Math.max(0.06, progress) : 1;

  const ghostRef = useRef<HTMLDivElement>(null);
  const firstChipRef = useRef<HTMLLIElement>(null);
  const [caught, setCaught] = useState<boolean | null>(null);

  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    return onScrollFrame(() => {
      const section = sectionRef.current;
      const chip = firstChipRef.current;
      const band = document.querySelector<HTMLElement>("[data-ticker-band]");
      const on = section && chip && band && window.matchMedia("(min-width: 1024px)").matches && !prefersReducedMotion();
      if (!on) {
        ghost.removeAttribute("data-active");
        setCaught(null);
        return;
      }
      const vh = window.innerHeight;
      const p = clamp01((vh - section.getBoundingClientRect().top) / (vh * 0.9));
      const landed = p >= 0.97;
      setCaught(landed);
      if (p <= 0 || landed) {
        ghost.removeAttribute("data-active");
        return;
      }
      ghost.setAttribute("data-active", "");
      const b = band.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      const e = easeOutCubic(p);
      const sx = b.left + b.width / 2 - ghost.offsetWidth / 2;
      const sy = b.top + b.height / 2 - ghost.offsetHeight / 2;
      const x = sx + (c.left - sx) * e;
      const y = sy + (c.top - sy) * e;
      ghost.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      ghost.style.opacity = Math.min(smoothstep(0, 0.12, p), 1 - smoothstep(0.86, 0.97, p)).toFixed(3);
    });
  }, [sectionRef]);

  return (
    <section id="como-funciona" ref={sectionRef} className="bee-story" data-measured={measured ? "true" : undefined}>
      {/* The caught ticker item in flight (see docblock). */}
      <div ref={ghostRef} className="bee-catch-ghost bee-glass" aria-hidden>
        <Radio className="size-3.5 shrink-0 text-[var(--color-chart-4)]" strokeWidth={1.75} />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{caughtText}</span>
      </div>
      <div ref={pinRef} className="bee-story__pin">
        {/* py-16 → lg:py-10: while pinned, everything here has to fit in
         * one viewport minus the header (see .bee-story__pin); the ~700px a
         * 768px-tall laptop leaves is exactly what this layout measures. */}
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20 lg:py-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow bee-eyebrow--warm">{t("eyebrow")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:mt-8 lg:grid-cols-12 lg:gap-10">
            {/* Steps + the filling track */}
            <ol className="bee-story__steps relative lg:col-span-5" aria-label={t("heading")}>
              <span className="bee-story__track" aria-hidden>
                <span className="bee-story__track-fill" style={{ "--p": trackFill.toFixed(3) } as React.CSSProperties} />
              </span>
              {STEPS.map((step, i) => {
                const state = !measured || i === active ? "active" : i < active ? "past" : "next";
                return (
                  <li key={step.id} className="bee-story__step" data-state={state} style={{ "--step-color": step.color } as React.CSSProperties}>
                    <div className="bee-bento bee-bento-pad bee-story__card">
                      <div className="flex items-start gap-3.5">
                        <span className="bee-story__disc flex size-10 shrink-0 items-center justify-center rounded-full">
                          <step.icon className="size-4.5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold tracking-tight">{t(`steps.${step.id}.title`)}</h3>
                          <p className="bee-caption mt-1.5">{t(`steps.${step.id}.description`)}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Stage: the hive lighting up + one event chip per step */}
            <div className="lg:col-span-7">
              <div className="bee-glass bee-story__stage rounded-[var(--radius-lg)] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="bee-eyebrow">{t("stage.title")}</p>
                  <span className="bee-micro hidden lg:inline">{t("stage.scrollHint")}</span>
                </div>
                <div className="mt-2 flex h-40 items-center justify-center sm:h-44">
                  <MarketingHoneycomb progress={measured ? progress : undefined} />
                </div>
                <ol className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {STEPS.map((step, i) => {
                    // The first chip waits for the caught ticker item to land
                    // when that flight is active; otherwise the normal rule.
                    const shown = !measured || (i <= active && (i !== 0 || caught === null || caught));
                    const approved = step.id === "approve" && (!measured || progress >= 0.94);
                    return (
                      <li
                        key={step.id}
                        ref={i === 0 ? firstChipRef : undefined}
                        className="bee-story__chip bee-bento flex items-start gap-2.5 p-3"
                        data-shown={shown ? "true" : undefined}
                        data-current={measured && i === active ? "true" : undefined}
                        style={{ "--step-color": step.color } as React.CSSProperties}
                      >
                        <span className="bee-story__chip-dot mt-1 size-2 shrink-0 rounded-full" aria-hidden />
                        <div className="min-w-0">
                          <p className="bee-micro font-semibold uppercase tracking-wide">{t(`stage.${step.id}.label`)}</p>
                          <p className="mt-0.5 text-xs leading-snug">{t(`stage.${step.id}.text`)}</p>
                          {step.id === "approve" && (
                            <span className="bee-story__approve mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-micro font-semibold" data-approved={approved ? "true" : undefined}>
                              <Check className="size-3" strokeWidth={3} />
                              {approved ? t("stage.approvedLabel") : t("stage.approveLabel")}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="bee-micro mt-3">{t("stage.note")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
