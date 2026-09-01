import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "@/components/contact-form";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.contacto.meta");
  return { title: t("title"), description: t("description") };
}

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
  const t = await getTranslations("legalMarketing.contacto");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                {t("heroTitle")}
              </h1>
              <p className="bee-caption mt-4 max-w-sm text-base">{t("heroSubtitle")}</p>

              <div className="mt-8 space-y-4">
                <div className="bee-bento bee-bento-pad">
                  <p className="text-sm font-semibold">{t("afterSubmitTitle")}</p>
                  <p className="bee-caption mt-1.5">{t("afterSubmitBody")}</p>
                </div>
                <div className="bee-bento bee-bento-pad">
                  <p className="text-sm font-semibold">{t("haveAccountTitle")}</p>
                  <p className="bee-caption mt-1.5">{t("haveAccountBody")}</p>
                </div>
                <div className="bee-bento bee-bento-pad">
                  <p className="text-sm font-semibold">{t("mvpNoticeTitle")}</p>
                  <p className="bee-caption mt-1.5">{t("mvpNoticeBody")}</p>
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
