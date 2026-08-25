import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Términos de Servicio — BEE",
  description: "Condiciones de uso de la plataforma BEE.",
};

const SECTIONS = [
  {
    title: "1. Aceptación de estos términos",
    body: "Al crear una cuenta o usar BEE aceptas estos términos. Si no estás de acuerdo, no debes usar el servicio.",
  },
  {
    title: "2. Qué es BEE",
    body: "BEE es una plataforma de inteligencia comercial: detecta señales de mercado, las prioriza y prepara acciones de alcance comercial. El servicio se presta \"tal cual\" (as-is), en mejora continua.",
  },
  {
    title: "3. Tu cuenta",
    body: "Eres responsable de mantener la confidencialidad de tus credenciales y de la actividad que ocurre bajo tu cuenta. Cada organización tiene sus datos aislados de las demás — ver la página de Seguridad para el detalle técnico.",
  },
  {
    title: "4. Aprobación humana en cualquier envío",
    body: "BEE puede sugerir o preparar mensajes, secuencias y acciones de alcance, pero ninguna acción externa (un email, un mensaje, una secuencia) se ejecuta sin que un usuario de tu cuenta la apruebe explícitamente. Eres responsable del contenido final que apruebas y envías a través de la plataforma.",
  },
  {
    title: "5. Tus datos",
    body: "Los datos que cargas o que BEE recolecta para tu cuenta te pertenecen a ti. No los usamos para entrenar modelos de terceros ni los compartimos con otras organizaciones que usan la plataforma.",
  },
  {
    title: "6. Limitación de responsabilidad",
    body: "BEE prioriza y sugiere en base a señales disponibles públicamente y a tus propios datos — no garantiza resultados comerciales específicos. En la medida permitida por la ley aplicable, no somos responsables por decisiones comerciales tomadas en base a estas sugerencias.",
  },
  {
    title: "7. Cambios a estos términos",
    body: "Podemos actualizar estos términos. Si el cambio es material, te lo vamos a comunicar por email o dentro de la plataforma antes de que entre en vigencia.",
  },
  {
    title: "8. Contacto",
    body: "Para cualquier consulta sobre estos términos, escríbenos desde la página de Contacto.",
  },
] as const;

export default function TerminosPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
          <p className="bee-eyebrow text-center">Legal</p>
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Términos de Servicio
          </h1>

          <div className="mt-8 flex items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-primary)]/20 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-chart-2)]" />
            <p className="bee-caption">
              Borrador de referencia, no un documento legal definitivo — antes de operar
              comercialmente con estos términos, hazlos revisar por un asesor legal y completa
              los datos societarios y de jurisdicción que correspondan.
            </p>
          </div>

          <div className="mt-10 space-y-8">
            {SECTIONS.map((s) => (
              <div key={s.title}>
                <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
                <p className="bee-caption mt-2 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <p className="bee-micro mt-10 border-t border-[var(--color-divider)] pt-4">
            Última actualización: ver control de versiones del sitio.
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
