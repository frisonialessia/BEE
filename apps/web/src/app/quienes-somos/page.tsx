import type { Metadata } from "next";
import { CheckCircle2, ShieldCheck, Target, UserCheck } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Quiénes somos — BEE",
  description: "Por qué existe BEE y qué principios sostienen cada decisión de producto.",
};

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Si no hay dato, no lo inventamos",
    description:
      "Cada score y cada métrica que ves en BEE sale de un dato real. Cuando no hay suficiente información, el sistema muestra un espacio vacío — nunca un número relleno para que la pantalla se vea completa.",
  },
  {
    icon: UserCheck,
    title: "La decisión final es siempre tuya",
    description:
      "BEE prepara la jugada — el mensaje, el canal, el momento — pero ninguna acción externa sale sin que tú la apruebes explícitamente.",
  },
  {
    icon: Target,
    title: "Construimos lo que describimos",
    description:
      "Esta misma página, la de Funcionalidades y el Demo en vivo describen capacidades que ya corren en producción — no un roadmap ni una promesa de venta.",
  },
] as const;

export default function QuienesSomosPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">Quiénes somos</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Un equipo comercial no debería perder tiempo buscando la señal.
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">
            BEE nace de un problema simple: la información que anticipa una venta —una ronda de
            financiamiento, una contratación clave, un cambio de stack— ya existe en algún lado.
            El trabajo no debería ser encontrarla, sino decidir qué hacer con ella.
          </p>
        </section>

        <section className="border-t border-border bg-[var(--color-primary)]/10">
          <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="bee-eyebrow">Cómo pensamos</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Tres principios que no negociamos.
              </h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="bee-bento bee-bento-pad-lg">
                  <p.icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                  <h3 className="mt-3 text-sm font-semibold tracking-tight">{p.title}</h3>
                  <p className="bee-caption mt-1.5">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
          <div className="bee-bento bee-bento-pad-lg">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-chart-4)]" />
              <div>
                <h3 className="text-sm font-semibold">Un equipo chico, todavía</h3>
                <p className="bee-caption mt-1.5">
                  BEE está en una etapa temprana — preferimos decir esto claramente en vez de
                  simular una escala que todavía no tenemos. Si te interesa lo que estamos
                  construyendo, la mejor forma de hablar con nosotros es directamente desde{" "}
                  <a href="/contacto?source=quienes_somos" className="font-medium text-foreground underline underline-offset-4">
                    Contacto
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
