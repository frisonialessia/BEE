import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FeatureCards } from "@/components/marketing/feature-cards";
import { HowItWorks } from "@/components/marketing/how-it-works";
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
 * Página pública de funcionalidades: por qué BEE no es un CRM.
 *
 * Dos versiones anteriores fallaron por lo mismo desde lados opuestos. La
 * primera eran siete bandas a todo el ancho con título, una línea y tres
 * chips cada una: nueve pantallas de adjetivos. La segunda metió los siete
 * módulos en un marco con pestañas, pero con tablas de registros del
 * sandbox — cuentas, montos, scores — que convertían la página en una
 * imitación del producto. No es eso: es la explicación de por qué el
 * producto existe, y el producto está a un clic en /probar.
 *
 * Ahora es una cuadrícula de ocho tarjetas (`feature-cards.tsx`), una por
 * capacidad que un CRM no tiene, cada una con una figura **abstracta** en
 * el tono de su módulo — barras, panal, embudo, anillo — sin un solo
 * número ni nombre de empresa. Después, la comparación de tres columnas
 * (`MarketingSales`) y el FAQ, que ya cierran la página por su cuenta.
 */
export default async function FuncionalidadesPage() {
  const t = await getTranslations("legalMarketing.funcionalidades");
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

        <section className="mx-auto w-full max-w-6xl px-6 pb-12 lg:pb-14">
          <Reveal>
            <FeatureCards />
          </Reveal>
        </section>

        {/* El panorama narrativo va DESPUÉS: quien llega aquí ya vio la
            landing y quiere ver en qué se diferencia BEE, no que se lo
            expliquen otra vez antes de enseñárselo. */}
        <HowItWorks locale={locale} />

        {/* Ventas + FAQ — cada una trae su propio cierre (la comparación con
            un CRM y con las herramientas de intent, y el acordeón de
            objeciones), así que no hace falta un tercer cierre genérico. */}
        <MarketingSales />
        <MarketingFAQ />
      </main>

      <MarketingFooter />
    </div>
  );
}
