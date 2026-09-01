import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { getApiBaseUrl } from "@/lib/api/client";

/** Pie ejecutivo — marca, navegación real (sin enlaces inventados) y copyright.
 *  Server component (async, `getTranslations` — not the `useTranslations`
 *  hook) since it needs nothing client-side; keeping it a server component
 *  means the footer's translated markup ships as static HTML instead of
 *  extra client JS. */
export async function MarketingFooter() {
  const t = await getTranslations("marketing.footer");
  const year = new Date().getUTCFullYear();

  const productLinks = [
    { label: t("productLinks.features"), href: "/funcionalidades" },
    { label: t("productLinks.solutions"), href: "/soluciones" },
    { label: t("productLinks.preview"), href: "#producto" },
    { label: t("productLinks.apiDocs"), href: `${getApiBaseUrl()}/docs`, external: true },
  ] as const;

  const companyLinks = [
    { label: t("companyLinks.about"), href: "/quienes-somos" },
    { label: t("companyLinks.careers"), href: "/careers" },
    { label: t("companyLinks.security"), href: "/seguridad" },
  ] as const;

  const accountLinks = [
    { label: t("accountLinks.login"), href: "/login" },
    { label: t("accountLinks.register"), href: "/register" },
    { label: t("accountLinks.contact"), href: "/contacto?source=footer" },
    { label: t("accountLinks.support"), href: "/soporte" },
  ] as const;

  const legalLinks = [
    { label: t("legalLinks.terms"), href: "/terminos" },
    { label: t("legalLinks.privacy"), href: "/privacidad" },
  ] as const;

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo />
            <p className="bee-caption mt-3 max-w-xs">{t("tagline")}</p>
          </div>

          <nav aria-label={t("product")}>
            <p className="bee-eyebrow">{t("product")}</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
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

          <nav aria-label={t("company")}>
            <p className="bee-eyebrow">{t("company")}</p>
            <ul className="mt-3 space-y-2">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("account")}>
            <p className="bee-eyebrow">{t("account")}</p>
            <ul className="mt-3 space-y-2">
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("legal")}>
            <p className="bee-eyebrow">{t("legal")}</p>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
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
          <span>{t("copyright", { year })}</span>
          <span>{t("tagline2")}</span>
        </div>
      </div>
    </footer>
  );
}
