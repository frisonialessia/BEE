import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { CrmPreview } from "@/components/marketing/crm-preview";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ProductTour } from "@/components/marketing/product-tour";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingSales } from "@/components/marketing-sales";
import { Reveal } from "@/components/marketing-motion";
import type { Locale } from "@/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.funcionalidades.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Página pública de funcionalidades.
 *
 * Antes: siete bandas a todo el ancho, una por módulo, alternando lados —
 * cada una con título, una línea, tres chips y una tarjeta de gráfico. Eran
 * unas nueve pantallas de scroll para entender qué hace BEE, y lo que
 * decían eran adjetivos ("detección en tiempo real") en vez de producto.
 *
 * Ahora los siete módulos viven en UN marco con pestañas
 * (`product-tour.tsx`), del alto de uno solo, y el espacio que eso libera
 * se gasta en filas de registros de verdad: ocho señales con su score, ocho
 * oportunidades con su monto y su etapa. Debajo, el tablero CRM real en
 * miniatura (`crm-preview.tsx`) porque es una de las cuatro piezas que la
 * fundadora nombró como buenas — mejor enseñarlo que describirlo.
 *
 * Todo sale de `lib/sample-data`, el mismo fixture del sandbox, y cada
 * bloque lo dice. Ningún número inventado (DESIGN_BRIEF §2.10).
 */
export default async function FuncionalidadesPage() {
  const t = await getTranslations("legalMarketing.funcionalidades");
  const tCrm = await getTranslations("legalMarketing.funcionalidades.crmPreview");
  const locale = (await getLocale()) as Locale;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 pb-8 pt-14 text-center sm:pt-16">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">{t("heroSubtitle")}</p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-12">
          <Reveal>
            <ProductTour locale={locale} />
          </Reveal>
          <p className="bee-micro mt-3 text-center">{t("demoNote")}</p>
        </section>

        {/* El panorama narrativo va DESPUÉS del producto: quien llega aquí
            ya vio la landing y quiere ver la herramienta, no que se la
            expliquen otra vez antes de enseñársela. */}
        <HowItWorks locale={locale} />

        <section className="mx-auto w-full max-w-6xl px-6 py-12 lg:py-14">
          <Reveal>
            <div className="mb-5">
              <p className="bee-eyebrow">{tCrm("eyebrow")}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{tCrm("title")}</h2>
              <p className="bee-caption mt-3 max-w-2xl">{tCrm("caption")}</p>
            </div>
            <CrmPreview locale={locale} />
          </Reveal>
        </section>

        {/* Ventas + FAQ — cada una trae su propio cierre (simulador + CTAs,
            y el acordeón de objeciones), así que no hace falta un tercer
            cierre genérico después de esto. */}
        <MarketingSales />
        <MarketingFAQ />
      </main>

      <MarketingFooter />
    </div>
  );
}
