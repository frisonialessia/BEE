import Link from "next/link";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/logo";

/**
 * Cabecera pública — barra flotante: sticky, centrada en el mismo
 * max-w-6xl que el resto de la landing, esquinas redondeadas, fondo de
 * tarjeta translúcido con blur y borde hairline (.bee-nav en globals.css,
 * puros tokens). Logo a la izquierda, enlaces limpios al centro
 * (Funcionalidades · Contacto), a la derecha "Iniciar sesión" como enlace
 * de texto discreto y un único CTA sólido "Probar sin registrarte" — el
 * camino de cero fricción, el único que sigue visible mientras el
 * visitante scrollea.
 *
 * Botones sin el wrapper <Button> de shadcn a propósito: sus variantes
 * cva traían su propio alto/padding/radio, distinto del sistema
 * .bee-btn/.bee-btn-ghost que usa el resto de la app.
 *
 * En teléfono solo quedan logo + CTA: los enlaces del centro y "Iniciar
 * sesión" no entran sin que el CTA se salga de la pantalla, y siguen
 * alcanzables desde el footer. El hidden/md: va en un <span> envolvente,
 * no directo en el link (.bee-btn-text fija su propio display fuera de
 * @layer y ganaría a cualquier utilidad de Tailwind).
 */
export function MarketingHeader() {
  const t = useTranslations("marketing.header");

  return (
    <header className="sticky top-0 z-40 px-4 pt-3 sm:px-6">
      <div className="bee-nav mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 rounded-2xl px-4 sm:px-5">
        <Link href="/" aria-label="Inicio BEE" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
          <Link href="/funcionalidades" className="bee-btn-text text-sm">
            {t("features")}
          </Link>
          <Link href="/contacto" className="bee-btn-text text-sm">
            {t("contact")}
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:inline-flex">
            <Link href="/login" className="bee-btn bee-btn--secondary">
              {t("login")}
            </Link>
          </span>
          <Link href="/probar" className="bee-btn bee-btn--primary bee-cta-lift">
            {t("tryFree")}
          </Link>
        </div>
      </div>
    </header>
  );
}
