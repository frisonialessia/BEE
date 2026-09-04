import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.privacidad.meta");
  return { title: t("title"), description: t("description") };
}

interface LegalSection {
  title: string;
  body: string;
}

/** Índice (0-based) de la sección "Seguridad" — su body real se renderiza
 * aparte, vía `t.rich("securityBody", ...)`, para incluir el link a
 * /seguridad. El `body` que trae el array `sections` para este índice no
 * se usa (se pisa), tal como en la versión original hardcodeada. */
const SECURITY_SECTION_INDEX = 4;

export default async function PrivacidadPage() {
  const t = await getTranslations("legalMarketing.privacidad");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
          <p className="bee-eyebrow text-center">{t("eyebrow")}</p>
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>

          <div className="mt-8 flex items-start gap-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-primary)]/20 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-text)]" />
            <p className="bee-caption">{t("draftNotice")}</p>
          </div>

          <div className="mt-10 space-y-8">
            {sections.map((s, i) => (
              <div key={s.title}>
                <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
                <p className="bee-caption mt-2 text-sm leading-relaxed">
                  {i === SECURITY_SECTION_INDEX ? (
                    t.rich("securityBody", {
                      link: (chunks) => (
                        <Link href="/seguridad" className="font-medium text-foreground underline underline-offset-4">
                          {chunks}
                        </Link>
                      ),
                    })
                  ) : (
                    s.body
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="bee-micro mt-10 border-t border-[var(--color-divider)] pt-4">
            {t("lastUpdated")}
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
