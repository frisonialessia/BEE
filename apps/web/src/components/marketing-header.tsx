import Link from "next/link";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { MarketingScrollGauge } from "@/components/marketing-scroll-gauge";

/**
 * Cabecera pública — Iniciar sesión + Funcionalidades + Probar sin
 * registrarte (/probar). El CTA relleno manda al sandbox, no a /contacto —
 * es el mismo camino de cero fricción que el botón ghost del hero, y este
 * es el único que queda visible siempre (sticky) mientras el visitante
 * scrollea el resto de la landing.
 *
 * Botones sin el wrapper <Button> de shadcn a propósito: sus variantes
 * cva (size="sm"/"lg") traían su propio alto/padding/radio, distinto del
 * sistema .bee-btn/.bee-btn-ghost que usa el resto de la app (Control,
 * Leads, etc.) — de ahí que radios y tamaños de botón no coincidieran
 * entre la landing y el dashboard. Enlaces planos + clases bee-btn*
 * directas, igual que en cualquier otra página del producto.
 */
export function MarketingHeader() {
  const t = useTranslations("marketing.header");

  return (
    <header className="sticky top-0 z-40 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-background)_75%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <Link href="/" aria-label="Inicio BEE" className="shrink-0">
          <Logo />
        </Link>
        {/* Funcionalidades/Iniciar sesión ocultos bajo sm: en un viewport de
         * teléfono no entran junto al logo y al CTA principal sin que este
         * último se salga de la pantalla — el CTA es lo único imprescindible
         * ahí; los otros dos siguen alcanzables desde el footer.
         *
         * El hidden/sm: va en un <span> envolvente, no directo en el link:
         * .bee-btn-ghost fija su propio display:inline-flex como CSS sin
         * capa (fuera de @layer), y una regla sin capa siempre gana sobre
         * cualquier utilidad de Tailwind — que sí vive dentro de @layer
         * utilities — sin importar el breakpoint. Puesto directo en el
         * link, hidden/sm:inline-flex quedaban anulados y el link nunca
         * se ocultaba en mobile. En el <span> no hay pelea: nada ahí
         * fuerza su propio display. */}
        <nav className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:inline-flex">
            <LanguageSwitcher />
          </span>
          <span className="hidden sm:inline-flex">
            <Link href="/funcionalidades" className="bee-btn-ghost">
              {t("features")}
            </Link>
          </span>
          <span className="hidden sm:inline-flex">
            <Link href="/login" className="bee-btn-ghost">
              {t("login")}
            </Link>
          </span>
          <Link href="/probar" className="bee-btn bee-btn--primary bee-cta-glow">
            {t("tryFree")}
          </Link>
          {/* Page-progress gauge — a small honeycomb that heats up as the
           * visitor scrolls (see MarketingScrollGauge). The header is the
           * only element on screen for the whole scroll story, so it is
           * where "how far along am I" belongs; it doubles as back-to-top. */}
          <MarketingScrollGauge />
        </nav>
      </div>
    </header>
  );
}
