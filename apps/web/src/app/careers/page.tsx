import type { Metadata } from "next";
import { ArrowRight, Briefcase } from "lucide-react";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Careers — BEE",
  description: "No hay posiciones abiertas en este momento — escribinos si te interesa BEE.",
};

/**
 * Página honesta a propósito: no hay vacantes reales para publicar, así
 * que no inventamos ninguna. Mismo criterio de "cero alucinaciones" que
 * el resto del sitio — una página de Careers con roles falsos sería
 * exactamente el tipo de contenido fabricado que este proyecto evita en
 * cada otra decisión.
 */
export default function CareersPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-6 py-16 text-center sm:py-24">
          <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-primary)]/40">
            <Briefcase className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
          </div>
          <p className="bee-eyebrow mt-4">Careers</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            No tenemos posiciones abiertas en este momento.
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-md text-base">
            Preferimos decir esto claramente en vez de publicar vacantes que no existen. Si te
            interesa lo que estamos construyendo y querés que te tengamos en cuenta para más
            adelante, escribinos — leemos cada mensaje.
          </p>
          <div className="mt-8">
            <Link href="/contacto?source=careers" className="bee-btn bee-btn--primary">
              Escribinos <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-[var(--color-primary)]/10">
          <div className="mx-auto w-full max-w-2xl px-6 py-14 text-center sm:py-16">
            <p className="bee-eyebrow">Mientras tanto</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              Así pensamos cuando construimos.
            </h2>
            <p className="bee-caption mx-auto mt-3 max-w-md">
              Cero datos inventados, aprobación humana antes de cualquier acción externa,
              aislamiento estricto por cuenta desde el diseño — no reglas de marketing, es cómo
              está hecho el producto. Si eso te resuena, probablemente encajemos.
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
