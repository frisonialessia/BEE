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

        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center" style={{ marginTop: "clamp(0.25rem, 3vh, 2.5rem)" }}>
          {/* Plain auxiliary label, not a badge: a pill with its own
              background wash competed visually with the H1 right below
              it for "first thing you read" — a small, quiet uppercase
              line reads as a category tag instead, exactly what it is. */}
          <span className="bee-eyebrow bee-eyebrow--hero">{t("eyebrow")}</span>
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
            {/* .bee-input's own height is the compact tier (2rem) — one
                size smaller than .bee-btn's primary tier (2.25rem), by
                design everywhere else. Here the two sit right next to
                each other as one action, so the mismatch reads as a
                bug: bumped this one input to the primary tier inline
                rather than touching the shared class every other input
                in the app still needs at its normal, smaller size.
                flex-1 only from sm: up (the row layout, where it grows
                to fill the width beside the button): on mobile the form
                is flex-col, where flex-1's flex-basis:0% governs the
                MAIN axis — height, in a column — and silently overrides
                any explicit height. .bee-input's own width:100% already
                gives it full mobile width without flex-1's help. */}
            <input
              id="hero-email"
              name="email"
              type="email"
              required
              placeholder={t("signup.placeholder")}
              className="bee-input sm:flex-1"
              style={{ height: "var(--bee-control-h-primary)" }}
            />
            <button type="submit" className="bee-btn bee-btn--primary bee-cta-lift shrink-0 justify-center">
              {t("signup.cta")}
            </button>
          </form>
          <Link href="/probar" className="bee-micro mt-2 hover:text-foreground">
            {t("signup.orTry")}
          </Link>
        </div>

        {/* The collage breaks out of the text column's max-w-3xl (768px) —
            that width is a deliberate line-length cap for the headline and
            paragraph, but on a wide monitor it left the whole 12-card
            collage sitting in a narrow strip with dead space on both
            sides. The collage itself has no reading-width concern, so it
            gets its own, wider ceiling instead. */}
        <div className="relative z-10 w-full max-w-[1160px]">
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
