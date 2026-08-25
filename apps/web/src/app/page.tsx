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

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingPreview } from "@/components/marketing-preview";
import { Button } from "@/components/ui/button";

/**
 * Landing pública — la primera pantalla que ve cualquier visitante antes de
 * autenticarse. Todo el contenido de esta página describe capacidades reales
 * ya implementadas en el producto (cada enlace apunta a una ruta real del
 * dashboard) — nada de logos de clientes ni métricas inventadas: la sección
 * de autoridad se apoya en garantías técnicas verificables del sistema
 * (aprobación humana, aislamiento multi-tenant, honestidad de datos) en vez
 * de prueba social fabricada.
 */

const MODULES = [
  {
    icon: Radio,
    title: "Motor de señales en tiempo real",
    description:
      "Detecta rondas de financiamiento, contrataciones clave y cambios de stack tecnológico apenas ocurren — sin que nadie tenga que ir a buscarlos.",
    href: "/dashboard/signals",
    tone: "bee-bento--primary",
  },
  {
    icon: Sparkles,
    title: "Brief del día",
    description:
      "Un resumen ejecutivo generado cada mañana con lo que de verdad importa en tu pipeline — cero fricción cognitiva antes de la primera llamada.",
    href: "/dashboard",
    tone: "bee-bento--warm",
  },
  {
    icon: TrendingUp,
    title: "Simulador de ingresos",
    description:
      "Proyecta escenarios de pipeline basados en intención de compra real detectada por el motor de señales — no en promedios genéricos del sector.",
    href: "/dashboard/forecast",
    tone: "",
  },
  {
    icon: Share2,
    title: "Automatización multicanal",
    description:
      "Diseña secuencias de alcance por email, LinkedIn y más que avanzan solas según cómo responde cada lead — siempre con tu aprobación antes de enviar nada.",
    href: "/dashboard/sequences",
    tone: "bee-bento--muted",
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

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border">
          <span className="bee-hex-float hidden sm:block" style={{ width: 140, height: 160, top: -40, right: "8%", animationDelay: "0s" }} aria-hidden />
          <span className="bee-hex-float hidden sm:block" style={{ width: 80, height: 92, bottom: -20, left: "4%", animationDelay: "1.8s" }} aria-hidden />

          <div className="relative mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
            <p className="bee-eyebrow">Sales Force Intelligence</p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Inteligencia comercial autónoma que decide en tiempo real.
            </h1>
            <p className="bee-caption mt-6 max-w-2xl text-base sm:text-lg">
              BEE vigila el mercado, prioriza tu pipeline y prepara la próxima jugada mientras vos cerrás —
              sin fricción, sin datos inventados, sin perder el control de cada decisión.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bee-btn--primary">
                <Link href="/register">
                  Comenzar ahora <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#producto">
                  <PlayCircle className="size-4" /> Ver demo en vivo
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Vista previa del producto ───────────────────────────────────── */}
        <section id="producto" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow">El panel de control</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              De la señal a la oportunidad, en una sola pantalla.
            </h2>
          </div>
          <div className="mt-10">
            <MarketingPreview />
          </div>
        </section>

        {/* ── Módulos de valor ─────────────────────────────────────────────── */}
        <section id="modulos" className="border-t border-border bg-[var(--color-primary)]/15">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <p className="bee-eyebrow">Plataforma</p>
            <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Cuatro motores, un solo flujo de trabajo.
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MODULES.map((m) => (
                <Link
                  key={m.title}
                  href={m.href}
                  className={`bee-bento bee-bento-pad bee-glass--hover group block ${m.tone}`}
                >
                  <div className="flex gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                      <m.icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold tracking-tight">{m.title}</h3>
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

        {/* ── Autoridad / garantías del sistema ───────────────────────────── */}
        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow">Por qué confiar en BEE</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Diseñado para equipos comerciales de alto rendimiento.
            </h2>
            <p className="bee-caption mt-3">
              No promesas — garantías de arquitectura que sostienen cada decisión que BEE toma por vos.
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

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Tu próximo cliente ya está mandando señales. La pregunta es si las estás viendo.
            </h2>
            <Button asChild size="lg" className="bee-btn--primary">
              <Link href="/register">
                Comenzar ahora <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
