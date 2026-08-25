import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, HelpCircle, LifeBuoy } from "lucide-react";

import { ContactForm } from "@/components/contact-form";
import { getApiBaseUrl } from "@/lib/api/client";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Soporte — BEE",
  description: "¿Ya usás BEE y tenés un problema? Estás en el lugar correcto.",
};

/**
 * Distinta de /contacto a propósito: Contacto es para prospectos nuevos
 * evaluando BEE, Soporte es para alguien que YA es cliente y tiene un
 * problema puntual. Mismo formulario/endpoint por debajo (POST
 * /api/v1/contact ya diferencia por `source`), pero el copy y los
 * atajos de esta página (FAQ, docs de la API) apuntan a resolver algo
 * ya en uso, no a convertir un lead nuevo.
 */
export default function SoportePage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-primary)]/40">
            <LifeBuoy className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
          </div>
          <p className="bee-eyebrow mt-4">Soporte</p>
          <h1 className="mx-auto mt-2 max-w-xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            ¿Ya usás BEE y algo no funciona como esperabas?
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-md text-base">
            Si todavía estás evaluando la plataforma, mejor escribinos desde{" "}
            <Link href="/contacto" className="font-medium text-foreground underline underline-offset-4">
              Contacto
            </Link>
            . Si ya tenés cuenta, contanos qué pasó acá abajo.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div className="space-y-4">
              <a
                href="#formulario"
                className="bee-bento bee-bento-pad flex items-start gap-3 transition-colors hover:border-[var(--color-chart-4)]"
              >
                <HelpCircle className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-4)]" />
                <div>
                  <p className="text-sm font-semibold">¿Ya viste las preguntas frecuentes?</p>
                  <p className="bee-caption mt-1">
                    Las dudas más comunes sobre de dónde salen las señales, aprobación humana y
                    aislamiento de datos están respondidas en la página principal.
                  </p>
                </div>
              </a>
              <a
                href={`${getApiBaseUrl()}/docs`}
                target="_blank"
                rel="noreferrer"
                className="bee-bento bee-bento-pad flex items-start gap-3 transition-colors hover:border-[var(--color-chart-4)]"
              >
                <BookOpen className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-4)]" />
                <div>
                  <p className="text-sm font-semibold">Documentación de la API</p>
                  <p className="bee-caption mt-1">
                    Si integraste BEE por API, la referencia completa de endpoints está acá.
                  </p>
                </div>
              </a>
            </div>

            <div id="formulario" className="bee-bento bee-bento-pad-lg scroll-mt-20">
              <p className="text-sm font-semibold">Contanos qué pasó</p>
              <p className="bee-caption mt-1 mb-5">
                Cuanto más detalle (qué esperabas ver, qué viste en cambio), más rápido podemos
                ayudarte.
              </p>
              <ContactForm source="soporte" />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
