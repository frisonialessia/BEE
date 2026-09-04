"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Flame, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { clamp01, onScrollFrame, prefersReducedMotion, Reveal, smoothstep } from "@/components/marketing-motion";
import { Badge } from "@/components/ui/badge";
import { scoreVariant } from "@/lib/format";

/**
 * MarketingBeforeAfter — mismas 6 empresas de ejemplo que el resto del
 * Demo en vivo (marketing-demo-panel.tsx), en dos estados: la lista cruda
 * sin BEE (sin score, sin orden, sin contexto — como llega un CSV
 * exportado del CRM) contra la misma lista priorizada por BEE (score,
 * badge de etapa, orden por intención). Mismo dataset en los dos lados a
 * propósito — el contraste tiene que venir de lo que BEE agrega, no de
 * comparar peras con manzanas.
 *
 * The two states are the ends of ONE scrub, not a toggle: a split handle
 * (0 = Sin BEE … 100 = Con BEE) that the visitor drags, moves with the
 * keyboard (role="slider": ←/→ ±10, Home/End, PageUp/Down ±25) or hits
 * with the two labelled buttons — and that scroll drives on its own
 * while the card crosses the viewport, until the visitor touches it. As
 * the handle crosses the middle the rows physically reorder from
 * alphabetical to score order with a FLIP animation (measure → invert →
 * play, transform only), while the "— sin dato —" labels cross-fade into
 * the stage/score badges. Server render = the raw state at 0, exactly
 * what the visitor sees before scrolling; reduced motion keeps every
 * control and simply drops the animation.
 */

const COMPANIES = [
  "Northwind Robotics",
  "Vantage Health",
  "Solace Data",
  "Fielder Logistics",
  "Bright Path Analytics",
  "Anchor Freight",
] as const;

// Mismo orden que llegarían en un export crudo — alfabético, sin ningún
// criterio de prioridad.
const RAW_ORDER = [...COMPANIES].sort();

// stage usa los mismos ids que landing.stages (ver marketing-demo-panel.tsx
// y marketing-honeycomb.tsx) — una sola fuente de verdad para las 4
// etiquetas de etapa en toda la landing.
const SCORED_ROWS = [
  { company: "Northwind Robotics", score: 92, stage: "ready_to_buy" },
  { company: "Anchor Freight", score: 88, stage: "ready_to_buy" },
  { company: "Vantage Health", score: 78, stage: "decision" },
  { company: "Solace Data", score: 65, stage: "consideration" },
  { company: "Bright Path Analytics", score: 58, stage: "consideration" },
  { company: "Fielder Logistics", score: 41, stage: "awareness" },
] as const;

const ROW_BY_COMPANY = new Map(SCORED_ROWS.map((r) => [r.company, r] as const));

export function MarketingBeforeAfter() {
  const t = useTranslations("landing.beforeAfter");
  const tStages = useTranslations("landing.stages");
  const [split, setSplit] = useState(0); // 0 = sin BEE … 100 = con BEE
  const [manual, setManual] = useState(false); // visitor took the handle
  const withBee = split >= 50;
  const cardRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const lastTops = useRef(new Map<string, number>());

  // Scroll drives the handle until the visitor touches it.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || manual || prefersReducedMotion()) return;
    return onScrollFrame(() => {
      const vh = window.innerHeight;
      const top = card.getBoundingClientRect().top;
      // 0 as the card's top enters at 85 % of the viewport, 100 once it
      // has risen to 35 % — the reorder happens at the midpoint.
      setSplit(Math.round(clamp01((vh * 0.85 - top) / (vh * 0.5)) * 100));
    });
  }, [manual]);

  // FLIP: rows keep their DOM key; when the order flips we measure where
  // each row was, where it is now, and play the difference as a transform.
  useLayoutEffect(() => {
    const els = rowEls.current;
    const previous = lastTops.current;
    const animate = !prefersReducedMotion();
    els.forEach((el, key) => {
      const top = el.getBoundingClientRect().top;
      const before = previous.get(key);
      if (animate && before !== undefined && Math.abs(before - top) > 0.5) {
        el.style.transition = "none";
        el.style.transform = `translateY(${(before - top).toFixed(1)}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 420ms cubic-bezier(0.2, 0.7, 0.2, 1)";
          el.style.transform = "";
        });
      }
      previous.set(key, top);
    });
  }, [withBee]);

  const set = (value: number) => {
    setManual(true);
    setSplit(Math.round(Math.min(100, Math.max(0, value))));
  };

  const fromPointer = (e: PointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10, PageDown: -25, PageUp: 25 };
    if (e.key === "Home") set(0);
    else if (e.key === "End") set(100);
    else if (e.key in steps) set(split + steps[e.key]);
    else return;
    e.preventDefault();
  };

  const order = withBee ? SCORED_ROWS.map((r) => r.company) : RAW_ORDER;
  // Badges fade in as the handle crosses 40→60 %; the raw label fades out.
  const scoredOpacity = smoothstep(40, 60, split);

  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="bee-eyebrow bee-eyebrow--violet">{t("eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
        </Reveal>

        <Reveal className="mt-8 flex items-center justify-between gap-3" delay={80}>
          <button type="button" onClick={() => set(0)} className={`bee-filter-tab ${!withBee ? "bee-filter-tab--active" : ""}`}>
            {t("withoutBee")}
          </button>
          <span className="bee-micro hidden text-center sm:block">{t("dragHint")}</span>
          <button type="button" onClick={() => set(100)} className={`bee-filter-tab ${withBee ? "bee-filter-tab--active" : ""}`}>
            {t("withBee")}
          </button>
        </Reveal>

        <Reveal className="mt-4" delay={160}>
          <div ref={cardRef} className="bee-bento bee-bento-pad-lg bee-split relative" data-with-bee={withBee ? "true" : undefined}>
            {/* Track + handle. The track is the card's full width; the
             * hairline drops through the list so the split reads as a
             * position, not just a knob. */}
            <div
              className="bee-split__track"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                fromPointer(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
              }}
              aria-hidden
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label={t("sliderLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={split}
              aria-valuetext={withBee ? t("withBee") : t("withoutBee")}
              aria-orientation="horizontal"
              className="bee-split__handle"
              style={{ "--split": `${split}%` } as React.CSSProperties}
              onKeyDown={onHandleKey}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                e.currentTarget.focus();
                fromPointer(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
              }}
            >
              <span className="bee-split__grip">
                <GripVertical className="size-3.5" strokeWidth={2} />
              </span>
              <span className="bee-split__line" />
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs" style={{ color: withBee ? "var(--color-chart-4)" : "var(--color-text-muted)" }}>
              {withBee ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              <span>{withBee ? t("scoredCaption") : t("rawCaption")}</span>
            </div>

            <div className="mt-3 divide-y divide-border">
              {order.map((company) => {
                const row = ROW_BY_COMPANY.get(company);
                return (
                  <div
                    key={company}
                    ref={(el) => {
                      if (el) rowEls.current.set(company, el);
                      else rowEls.current.delete(company);
                    }}
                    className="bee-split__row flex items-center justify-between py-2.5"
                  >
                    <span className={`text-sm ${withBee ? "font-medium" : "text-muted-foreground"}`}>{company}</span>
                    {/* Badges stay in flow (they set the row height, so it
                     * never changes across the flip); the raw label overlays
                     * them and the two cross-fade around the midpoint. */}
                    <span className="relative flex items-center justify-end">
                      {row && (
                        <span className="flex items-center gap-2" style={{ opacity: scoredOpacity }} aria-hidden={!withBee}>
                          <Badge variant="outline">{tStages(row.stage)}</Badge>
                          <Badge variant={scoreVariant(row.score)} className="font-mono">
                            {row.score >= 80 && <Flame className="mr-0.5 size-2.5" />}
                            {row.score}
                          </Badge>
                        </span>
                      )}
                      <span className="bee-micro absolute right-0" style={{ opacity: 1 - scoredOpacity }} aria-hidden={withBee}>
                        {t("noData")}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <p className="bee-micro mt-4 flex items-center justify-center gap-1.5 text-center">
          {!withBee ? (
            <>
              {t("clickPromptBefore")}{" "}
              <span className="font-medium text-foreground">&quot;{t("withBee")}&quot;</span>{" "}
              {t("clickPromptAfter")} <ArrowRight className="size-3" />
            </>
          ) : (
            t("illustrativeNote")
          )}
        </p>
      </div>
    </section>
  );
}
