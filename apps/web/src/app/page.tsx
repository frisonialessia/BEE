import Link from "next/link";
import {
  ArrowRight,
  Lock,
  PlayCircle,
  Radio,
  ShieldCheck,
  Share2,
  Sparkles,
  TrendingUp,
  UserCheck,
} from "lucide-react";

import { MarketingBeforeAfter } from "@/components/marketing-before-after";
import { MarketingDemoPanel } from "@/components/marketing-demo-panel";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingHowItWorks } from "@/components/marketing-how-it-works";
import { MarketingIntegrations } from "@/components/marketing-integrations";
import { MarketingOrbit } from "@/components/marketing-orbit";
import { MarketingSignalTicker } from "@/components/marketing-signal-ticker";

/**
 * Landing pública — la primera pantalla que ve cualquier visitante antes de
 * autenticarse. Todo el contenido describe capacidades reales ya
 * implementadas (cada enlace apunta a una ruta real del dashboard) — nada
 * de logos de clientes ni métricas inventadas: la sección de autoridad se
 * apoya en garantías técnicas verificables del sistema en vez de prueba
 * social fabricada.
 */

const MODULES = [
  {
    icon: Radio,
    title: "Motor de señales en tiempo real",
    description:
      "Detecta rondas de financiamiento, contrataciones clave y cambios de stack tecnológico apenas ocurren — sin que nadie tenga que ir a buscarlos.",
    href: "/funcionalidades#senales",
    tone: "bee-bento--primary",
    span: "bee-span-8",
  },
  {
    icon: Sparkles,
    title: "Brief del día",
    description:
      "Un resumen ejecutivo cada mañana con lo que de verdad importa en tu pipeline — cero fricción cognitiva antes de la primera llamada.",
    href: "/funcionalidades#brief",
    tone: "bee-bento--warm",
    span: "bee-span-4",
  },
  {
    icon: TrendingUp,
    title: "Simulador de ingresos",
    description:
      "Proyecta escenarios de pipeline basados en intención de compra real — no en promedios genéricos del sector.",
    href: "/funcionalidades#simulador",
    tone: "",
    span: "bee-span-4",
  },
  {
    icon: Share2,
    title: "Automatización multicanal",
    description:
      "Diseña secuencias de alcance por email, LinkedIn y más que avanzan solas según cómo responde cada lead — siempre con tu aprobación antes de enviar nada.",
    href: "/funcionalidades#automatizacion",
    tone: "bee-bento--muted",
    span: "bee-span-8",
  },
] as const;

const GUARANTEES = [
  {
    icon: ShieldCheck,
    title: "Cero alucinaciones",
    description: "Cada score y cada métrica sale de datos reales. Si no hay dato, el sistema muestra vacío — nunca lo inventa.",
  },
  {
    icon: UserCheck,
    title: "Aprobación humana siempre",
    description: "Ninguna acción externa — un email, un mensaje, una secuencia — se ejecuta sin luz verde explícita.",
  },
  {
    icon: Lock,
    title: "Multi-tenant real",
    description: "Aislamiento estricto de datos por organización, de punta a punta, no una bandera opcional.",
  },
  {
    icon: Radio,
    title: "Seguro desde el diseño",
    description: "Webhooks firmados con HMAC y secretos por entorno — las credenciales nunca tocan el código.",
  },
] as const;

/** Manchas de gradiente detrás del hero — mezcla de la paleta institucional,
 * blureadas y de baja opacidad para que el texto #222222 siga siendo
 * perfectamente legible encima. Puro CSS, sin imagen ni librería. */
function HeroAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 -top-32 size-[26rem] rounded-full bg-[var(--color-chart-4)]/35 blur-3xl" />
      <div className="absolute -right-16 -top-20 size-[22rem] rounded-full bg-[var(--color-chart-5)]/30 blur-3xl" />
      <div className="absolute left-1/3 top-24 size-[20rem] rounded-full bg-[var(--color-chart-2)]/20 blur-3xl" />
      <div className="absolute -bottom-24 right-1/4 size-[24rem] rounded-full bg-[var(--color-chart-6)]/25 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <HeroAtmosphere />

          <div className="relative mx-auto w-full max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
            <p className="bee-eyebrow">Sales Force Intelligence</p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Inteligencia comercial autónoma que decide en tiempo real.
            </h1>
            <p className="bee-caption mx-auto mt-6 max-w-xl text-base sm:text-lg">
              BEE vigila el mercado, prioriza tu pipeline y prepara la próxima jugada mientras tú cierras —
              sin fricción, sin datos inventados, sin perder el control de cada decisión.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/contacto?source=hero_primary" className="bee-btn bee-btn--primary">
                Comenzar ahora <ArrowRight className="size-4" />
              </Link>
              <Link href="/probar" className="bee-btn-ghost">
                <PlayCircle className="size-4" /> Probar sin registrarte
              </Link>
            </div>
          </div>

          {/* pb-12/pt-2 here, not the pb-20/pt-10 you'd expect for this much
           * visual breathing room — MarketingOrbit already reserves its own
           * py-8 internally (needed so its tilted cards' overshoot doesn't
           * get clipped, see the comment there), so stacking full padding
           * here on top of that would double up and push the section much
           * taller than intended. */}
          <div className="relative pb-12 pt-2 sm:pb-16">
            <MarketingOrbit />
          </div>
        </section>

        <MarketingSignalTicker />

        {/* ── Vista previa del producto ───────────────────────────────────── */}
        <section id="producto" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow">Demo en vivo</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              De la señal a la oportunidad — explora el panel tú mismo.
            </h2>
          </div>
          <div className="mt-10">
            <MarketingDemoPanel />
          </div>
        </section>

        <MarketingHowItWorks />

        <MarketingBeforeAfter />

        {/* ── Módulos de valor ─────────────────────────────────────────────── */}
        <section id="modulos" className="border-t border-border bg-[var(--color-primary)]/15">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <p className="bee-eyebrow">Plataforma</p>
            <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Cuatro motores, un solo flujo de trabajo.
            </h2>
            <div className="bee-bento-grid mt-10">
              {MODULES.map((m) => (
                <Link
                  key={m.title}
                  href={m.href}
                  className={`${m.span} bee-bento bee-bento-pad bee-glass--hover group block ${m.tone}`}
                >
                  <div className="flex h-full gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                      <m.icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight">{m.title}</h3>
                      <p className="bee-caption mt-1.5">{m.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-chart-4)] opacity-0 transition-opacity group-hover:opacity-100">
                        Explorar <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <MarketingIntegrations />

        {/* ── Autoridad / garantías del sistema ───────────────────────────── */}
        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow">Por qué confiar en BEE</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Diseñado para equipos comerciales de alto rendimiento.
            </h2>
            <p className="bee-caption mt-3">
              No promesas — garantías de arquitectura que sostienen cada decisión que BEE toma por ti.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map((g) => (
              <div key={g.title} className="bee-bento bee-bento-pad">
                <g.icon className="size-5 stroke-[1.5] text-[var(--color-chart-5)]" />
                <h3 className="mt-3 text-sm font-semibold tracking-tight">{g.title}</h3>
                <p className="bee-caption mt-1.5">{g.description}</p>
              </div>
            ))}
          </div>
        </section>

        <MarketingFAQ />

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Tu próximo cliente ya está mandando señales. La pregunta es si las estás viendo.
            </h2>
            <Link href="/contacto?source=closing_cta" className="bee-btn bee-btn--primary">
              Comenzar ahora <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
