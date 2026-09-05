import { Sparkles } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { HeroAtmosphere } from "@/components/marketing/hero-atmosphere";
import { HeroBento } from "@/components/marketing/hero-bento";
import { MarketingHeader } from "@/components/marketing-header";
import type { Locale } from "@/i18n/locales";

/**
 * Landing pública — vista única, cero scroll. Antes esto era seis bloques
 * a lo largo de una página larga (demo interactivo, "Cómo funciona",
 * comparación de Ventas, FAQ); ese contenido no se perdió, se movió a
 * /funcionalidades (ver how-it-works.tsx + MarketingSales + MarketingFAQ
 * ahí) porque ya no cabe en una sola pantalla. Lo que queda aquí es
 * exactamente lo que hace falta para entender qué es BEE y arrancar: el
 * titular, el bento de cinco piezas reales de producto (hero-bento.tsx,
 * nada de fotos de stock) y un único formulario — nombre de correo,
 * "Crear cuenta" — que entra directo al registro real con el correo
 * precargado (RegisterPage lee `?email=`), o el atajo al sandbox sin
 * registro. Sin footer largo: un renglón de copyright con los dos enlaces
 * legales que de otro modo quedarían sin ninguna entrada desde el home
 * (el resto de /footer sigue accesible desde cualquier otra página
 * pública).
 *
 * `h-dvh max-h-dvh overflow-hidden` en el contenedor raíz: la página nunca
 * scrollea, en ningún viewport — el título usa un tamaño fluido
 * (`clamp()`) en vez de saltos por breakpoint para comprimirse en vez de
 * desbordar en una ventana baja. El bento reduce a tres tarjetas en
 * teléfono (ver hero-bento.tsx) por ancho, no por alto.
 *
 * Color: texto e iconos en tinta; azul solo en el botón primario; los
 * tonos BEE viven en el bento (ver su propio docstring). Ningún número
 * inventado — todo sale de lib/sample-data.ts, igual que el resto del
 * sandbox.
 */
export default async function Home() {
  const t = await getTranslations("marketing.landing");
  const tFooter = await getTranslations("marketing.footer");
  const locale = (await getLocale()) as Locale;
  const year = new Date().getUTCFullYear();

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background">
      <MarketingHeader />

      <main className="relative flex flex-1 min-h-0 flex-col items-center justify-center overflow-hidden px-4 sm:px-6">
        <HeroAtmosphere />

        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{ background: "color-mix(in srgb, var(--color-chart-4) 14%, var(--color-card))" }}
          >
            <Sparkles className="size-3" aria-hidden />
            <span className="bee-eyebrow">{t("eyebrow")}</span>
          </span>
          <h1 className="mt-4 text-balance text-[clamp(1.5rem,3.6vh+1rem,3.5rem)] font-semibold leading-[1.08] tracking-tight text-[var(--color-text)]">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mt-3 line-clamp-2 max-w-lg text-[clamp(0.8rem,1.5vh+0.35rem,1.125rem)]">
            {t("heroSubtitle")}
          </p>

          <form action="/register" method="get" className="mt-5 flex w-full max-w-md flex-col gap-2 sm:mt-7 sm:flex-row sm:gap-2">
            <label htmlFor="hero-email" className="sr-only">
              {t("signup.emailLabel")}
            </label>
            <input
              id="hero-email"
              name="email"
              type="email"
              required
              placeholder={t("signup.placeholder")}
              className="bee-input h-10 flex-1"
            />
            <button type="submit" className="bee-btn bee-btn--primary bee-cta-lift h-10 shrink-0 justify-center">
              {t("signup.cta")}
            </button>
          </form>
          <Link href="/probar" className="bee-micro mt-2 hover:text-foreground">
            {t("signup.orTry")}
          </Link>

          <HeroBento locale={locale} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border px-4 py-2 text-center">
        <p className="bee-micro">
          {tFooter("copyright", { year })} ·{" "}
          <Link href="/terminos" className="hover:text-foreground">
            {tFooter("legalLinks.terms")}
          </Link>{" "}
          ·{" "}
          <Link href="/privacidad" className="hover:text-foreground">
            {tFooter("legalLinks.privacy")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
