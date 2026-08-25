import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Rocket, Target, Users } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Soluciones — BEE",
  description: "Cómo BEE encaja según el tipo de equipo comercial que eres.",
};

/**
 * Página de soluciones por caso de uso — deliberadamente NO repite los 4
 * módulos de /funcionalidades tal cual, sino que reordena las mismas
 * capacidades reales alrededor del dolor de cada tipo de equipo. Ningún
 * dato de "clientes en este segmento" ni estadística de adopción — eso
 * sería la misma prueba social fabricada que el resto del sitio evita.
 */

const USE_CASES = [
  {
    icon: Users,
    audience: "Equipos de SDR / BDR",
    pain: "Prospección manual que consume horas antes de la primera llamada.",
    fit: "El motor de señales prioriza qué cuenta atacar primero y el brief del día arma el contexto — menos tiempo investigando, más tiempo hablando con prospectos calientes.",
  },
  {
    icon: Rocket,
    audience: "Founders sin equipo de RevOps",
    pain: "Nadie dedicado a vigilar el mercado ni a decidir a quién priorizar.",
    fit: "BEE hace ese trabajo de fondo — detecta la señal, la enriquece y sugiere la próxima acción, sin que haga falta contratar un analista para eso.",
  },
  {
    icon: Building2,
    audience: "Agencias y equipos de growth",
    pain: "Gestionar el pipeline de varias cuentas a la vez, cada una con su propio ritmo.",
    fit: "El simulador de ingresos proyecta el impacto de subir la prospección por segmento, cuenta por cuenta, antes de comprometer horas del equipo.",
  },
  {
    icon: Target,
    audience: "Revenue teams en scale-up",
    pain: "El volumen de leads ya superó lo que un humano puede priorizar a mano.",
    fit: "La automatización multicanal diseña secuencias que avanzan solas según cómo responde cada lead — siempre con aprobación humana antes de enviar nada.",
  },
] as const;

export default function SolucionesPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">Soluciones</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Las mismas capacidades, según el problema que tengas.
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">
            No hay una versión distinta de BEE por segmento — hay un mismo sistema que resuelve
            un problema distinto según el tamaño y la forma de tu equipo comercial.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {USE_CASES.map((u) => (
              <div key={u.audience} className="bee-bento bee-bento-pad-lg">
                <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                  <u.icon className="size-4.5 stroke-[1.5] text-[var(--color-chart-4)]" />
                </div>
                <h2 className="mt-3 text-base font-semibold tracking-tight">{u.audience}</h2>
                <p className="bee-micro mt-2 uppercase tracking-wide text-[var(--color-chart-5)]">El problema</p>
                <p className="mt-1 text-sm leading-relaxed">{u.pain}</p>
                <p className="bee-micro mt-3 uppercase tracking-wide text-[var(--color-chart-4)]">Cómo encaja BEE</p>
                <p className="mt-1 text-sm leading-relaxed">{u.fit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              ¿No te ves reflejado en ninguno de estos? Cuéntanos tu caso.
            </h2>
            <Link href="/contacto?source=soluciones" className="bee-btn bee-btn--primary">
              Comenzar ahora <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
