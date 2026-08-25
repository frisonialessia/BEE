import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Contacto — BEE",
  description: "Hablá con el equipo de BEE. Te respondemos en menos de 24 horas hábiles.",
};

/**
 * Página pública de contacto — destino real de todos los "Comenzar ahora"
 * de la landing. El envío va a POST /api/v1/contact (ver
 * apps/api/app/api/v1/endpoints/contact.py) y se persiste de verdad — nada
 * de un formulario que solo simula un éxito. `source` (leído de la query)
 * deja registrado desde qué CTA llegó cada visitante, para que quien
 * triage estos leads vea qué parte de la página realmente convierte.
 */
export default async function ContactoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawSource = params.source;
  const source = typeof rawSource === "string" ? rawSource : undefined;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <p className="bee-eyebrow">Contacto</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Hablemos de tu pipeline.
              </h1>
              <p className="bee-caption mt-4 max-w-sm text-base">
                Contanos un poco de tu equipo comercial y te respondemos en menos de 24 horas
                hábiles — sin bots de ventas, sin formularios que se pierden en el aire.
              </p>

              <div className="mt-8 space-y-4">
                <div className="bee-bento bee-bento-pad">
                  <p className="text-sm font-semibold">¿Qué pasa después de enviar esto?</p>
                  <p className="bee-caption mt-1.5">
                    Un mensaje real llega directo a nuestro equipo — queda registrado, nunca se
                    descarta en silencio. Te contactamos por el email que dejes acá.
                  </p>
                </div>
                <div className="bee-bento bee-bento-pad">
                  <p className="text-sm font-semibold">¿Ya tenés cuenta?</p>
                  <p className="bee-caption mt-1.5">
                    Este formulario es para organizaciones nuevas. Si ya usás BEE, iniciá sesión
                    directamente en vez de escribirnos acá.
                  </p>
                </div>
              </div>
            </div>

            <div className="bee-bento bee-bento-pad-lg">
              <ContactForm source={source} />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
