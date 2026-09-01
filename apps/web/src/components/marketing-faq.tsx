"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
 */

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

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
          <p className="bee-caption pb-3 pr-8">{a}</p>
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
    <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
      </div>
      <div className="mt-8">
        {items.map((item) => (
          <FaqRow key={item.question} q={item.question} a={item.answer} />
        ))}
      </div>
    </section>
  );
}
