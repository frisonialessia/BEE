"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * MarketingFAQ — objeciones reales de un evaluador B2B, respondidas con
 * las mismas garantías arquitectónicas que ya aparecen en GUARANTEES
 * (app/page.tsx) — no texto nuevo inventado para esta sección, sino la
 * versión en pregunta-respuesta de lo que el sistema ya sostiene.
 */

const FAQ_ITEMS = [
  {
    q: "¿De dónde salen las señales y los scores?",
    a: "De fuentes públicas reales (LinkedIn, G2, Google Search) y de tus propios datos de pipeline. Si no hay dato suficiente para un score, el sistema lo muestra vacío — nunca inventa un número para que la pantalla se vea completa.",
  },
  {
    q: "¿BEE envía mensajes por mi cuenta sin que yo lo sepa?",
    a: "No. Ninguna acción externa — un email, un mensaje de LinkedIn, una secuencia — se ejecuta sin aprobación humana explícita. El sistema prepara la jugada; tú decides si sale.",
  },
  {
    q: "¿Mis datos se mezclan con los de otras cuentas?",
    a: "No. El aislamiento por organización es de punta a punta en la base de datos y en cada endpoint — no una bandera que se puede desactivar por error.",
  },
  {
    q: "¿Qué pasa si mi mercado no genera señales todavía?",
    a: "El sistema muestra el estado real: espacios vacíos donde no hay señal, en vez de rellenar con datos de ejemplo. Preferimos un panel honesto a uno que parezca activo sin estarlo.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Escríbenos desde el formulario de Contacto — te respondemos en menos de 24 horas hábiles para coordinar el primer paso.",
  },
] as const;

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

export function MarketingFAQ() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="bee-eyebrow">Preguntas frecuentes</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Antes de que preguntes.
        </h2>
      </div>
      <div className="mt-8">
        {FAQ_ITEMS.map((item) => (
          <FaqRow key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </section>
  );
}
