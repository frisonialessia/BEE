import Link from "next/link";

import { Logo } from "@/components/logo";
import { getApiBaseUrl } from "@/lib/api/client";

const PRODUCT_LINKS = [
  { label: "Funcionalidades", href: "/funcionalidades" },
  { label: "Vista previa", href: "#producto" },
  { label: "Documentación de la API", href: `${getApiBaseUrl()}/docs`, external: true },
] as const;

const ACCOUNT_LINKS = [
  { label: "Iniciar sesión", href: "/login" },
  { label: "Crear cuenta", href: "/register" },
  { label: "Contacto", href: "/contacto?source=footer" },
] as const;

/** Pie ejecutivo — marca, navegación real (sin enlaces inventados) y copyright. */
export function MarketingFooter() {
  const year = new Date().getUTCFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="bee-caption mt-3 max-w-xs">
              Inteligencia comercial autónoma para equipos de revenue que no tienen tiempo de buscar la señal —
              solo de actuar sobre ella.
            </p>
          </div>

          <nav aria-label="Producto">
            <p className="bee-eyebrow">Producto</p>
            <ul className="mt-3 space-y-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  {"external" in link && link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Cuenta">
            <p className="bee-eyebrow">Cuenta</p>
            <ul className="mt-3 space-y-2">
              {ACCOUNT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>© {year} BEE Intelligence — Sales Force Intelligence</span>
          <span>Modular · Eficiente · Consciente del mercado</span>
        </div>
      </div>
    </footer>
  );
}
