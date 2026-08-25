import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Radio,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Funcionalidades — BEE",
  description:
    "Los cuatro motores de BEE: señales en tiempo real, brief del día, simulador de ingresos y automatización multicanal.",
};

/**
 * Página pública dedicada a las funcionalidades — destino de los
 * "Explorar" de los 4 módulos en la landing (ver MODULES en app/page.tsx).
 * Un id por módulo (#senales, #brief, #simulador, #automatizacion) para
 * que cada tarjeta salte directo a su sección. Contenido descriptivo, no
 * las páginas reales del dashboard (que requieren sesión) — mismo criterio
 * que el resto de la landing: cada capacidad descripta acá existe de
 * verdad en el producto, nada aspiracional.
 */

const MODULES = [
  {
    id: "senales",
    icon: Radio,
    eyebrow: "Motor de señales",
    title: "Señales en tiempo real, sin que nadie tenga que ir a buscarlas.",
    description:
      "BEE vigila rondas de financiamiento, contrataciones clave, cambios de stack tecnológico y menciones de intención de compra en la web abierta — apenas ocurren, no en un resumen semanal.",
    points: [
      "Ingesta continua desde fuentes públicas y proveedores de datos B2B.",
      "Cada señal se enriquece automáticamente con la empresa y el contacto correcto.",
      "Priorización por score de intención, no por orden de llegada.",
    ],
  },
  {
    id: "brief",
    icon: Sparkles,
    eyebrow: "Brief del día",
    title: "Un resumen ejecutivo antes de tu primera llamada.",
    description:
      "Cada mañana, BEE arma un brief con lo que de verdad cambió en tu pipeline desde ayer — leads nuevos, cuentas que se calentaron, tareas vencidas — para que no tengas que reconstruir el contexto tú mismo.",
    points: [
      "Cero fricción cognitiva: lo importante arriba, lo rutinario abajo.",
      "Generado desde datos reales de tu cuenta, nunca una plantilla genérica.",
      "Disponible apenas inicias sesión, sin configuración adicional.",
    ],
  },
  {
    id: "simulador",
    icon: TrendingUp,
    eyebrow: "Simulador de ingresos",
    title: "Proyecta el impacto de prospectar más, antes de hacerlo.",
    description:
      "El simulador de ingresos corre escenarios de pipeline basados en intención de compra real de tu base de leads — no en promedios genéricos del sector — para que decidas cuánto subir la prospección con datos, no con intuición.",
    points: [
      "Tres escenarios (conservador, realista, optimista) por corrida.",
      "Curva de tendencia mensual, no solo un número final.",
      "Mismo motor que usa BEE internamente para priorizar cuentas.",
    ],
  },
  {
    id: "automatizacion",
    icon: Share2,
    eyebrow: "Automatización multicanal",
    title: "Secuencias que avanzan solas — nunca sin tu aprobación.",
    description:
      "Diseña secuencias de alcance por email, LinkedIn y más que se adaptan según cómo responde cada lead. BEE prepara el siguiente paso; tú das la luz verde antes de que salga cualquier mensaje.",
    points: [
      "Plantillas reutilizables por playbook, canal y tipo de señal.",
      "Pausa automática ante señales de riesgo (rebote, baja de interés).",
      "Ninguna acción externa se ejecuta sin aprobación humana explícita.",
    ],
  },
] as const;

export default function FuncionalidadesPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">Plataforma</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Cuatro motores, un solo flujo de trabajo.
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">
            Cada capacidad de aquí corre hoy en producción — nada de lo que sigue es una
            promesa de roadmap.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl divide-y divide-border px-6 pb-16 sm:pb-20">
          {MODULES.map((m, i) => (
            <div
              key={m.id}
              id={m.id}
              className="grid scroll-mt-20 grid-cols-1 items-center gap-8 py-14 lg:grid-cols-2 lg:gap-16"
            >
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <div className="flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-primary)]/40">
                  <m.icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                </div>
                <p className="bee-eyebrow mt-4">{m.eyebrow}</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{m.title}</h2>
                <p className="bee-caption mt-3 text-base leading-relaxed">{m.description}</p>
              </div>

              <div className={`bee-bento bee-bento-pad-lg space-y-3 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                {m.points.map((point) => (
                  <div key={point} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-chart-4)]" />
                    <p className="text-sm leading-relaxed">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              ¿Listo para ver estos cuatro motores trabajando sobre tu propio pipeline?
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/contacto?source=funcionalidades" className="bee-btn bee-btn--primary">
                Comenzar ahora <ArrowRight className="size-4" />
              </Link>
              <Link href="/#producto" className="bee-btn-ghost">
                Ver demo en vivo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
