"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion, Reveal } from "@/components/marketing-motion";

/**
 * MarketingFAQ — objeciones reales de un evaluador B2B, respondidas con
 * las mismas garantías arquitectónicas que ya aparecen en GUARANTEES
 * (app/page.tsx) — no texto nuevo inventado para esta sección, sino la
 * versión en pregunta-respuesta de lo que el sistema ya sostiene.
 *
 * Las preguntas/respuestas viven en messages/{locale}/landing.json bajo
 * `faq.items` como un array de {question, answer} — se leen con `t.raw`
 * (next-intl no tiene interpolación aquí, son strings planos) en vez de
 * `q1`/`a1`... aplanados, porque el componente ya itera sobre un array.
 *
 * Answers type themselves in: when a row opens, roughly the first two
 * lines stream at ~15 ms/char and the rest appears at once — BEE
 * "answering", the same way it drafts a strategy. The accordion's height
 * animation is untouched because the FULL answer is always in the layout
 * (rendered in transparent ink, still read by assistive tech) and the
 * typed text is an aria-hidden overlay on top of it — same font, same
 * width, so the lines wrap identically. Reduced motion, or a closed row,
 * shows the answer at once.
 */

const MS_PER_CHAR = 15;

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  // null → show the full answer; a number → that many characters typed.
  const [typed, setTyped] = useState<number | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    const el = textRef.current;
    if (!el) return;
    // ≈ two lines: the paragraph's width over an average glyph width
    // (0.5em for this sans at this size), never more than the answer.
    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 13;
    const limit = Math.min(a.length, Math.max(40, Math.round((el.clientWidth / (fontSize * 0.5)) * 2)));
    let count = 0;
    const start = requestAnimationFrame(() => setTyped(0));
    const id = window.setInterval(() => {
      count += 1;
      if (count >= limit) {
        window.clearInterval(id);
        setTyped(null); // the rest lands at once
        return;
      }
      setTyped(count);
    }, MS_PER_CHAR);
    return () => {
      cancelAnimationFrame(start);
      window.clearInterval(id);
      setTyped(null);
    };
  }, [open, a]);

  return (
    <div className="border-b border-border py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="text-sm font-medium">{q}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p ref={textRef} className="bee-caption bee-type relative pb-3 pr-8" data-typing={typed !== null ? "true" : undefined}>
            {/* Full answer: owns the layout and the accessible text. */}
            <span className="bee-type__full">{a}</span>
            {typed !== null && (
              <span className="bee-type__typed" aria-hidden>
                {a.slice(0, typed)}
                <span className="bee-type__caret" />
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

interface FaqItem {
  question: string;
  answer: string;
}

export function MarketingFAQ() {
  const t = useTranslations("landing.faq");
  const items = t.raw("items") as FaqItem[];

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-14">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow bee-eyebrow--violet">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
      </Reveal>
      <Reveal stagger className="mt-8">
        {items.map((item) => (
          <FaqRow key={item.question} q={item.question} a={item.answer} />
        ))}
      </Reveal>
    </section>
  );
}
