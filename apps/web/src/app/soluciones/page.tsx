import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Building2, Rocket, Target, Users } from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.soluciones.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Página de soluciones por caso de uso — deliberadamente NO repite los 4
 * módulos de /funcionalidades tal cual, sino que reordena las mismas
 * capacidades reales alrededor del dolor de cada tipo de equipo. Ningún
 * dato de "clientes en este segmento" ni estadística de adopción — eso
 * sería la misma prueba social fabricada que el resto del sitio evita.
 */

const USE_CASE_ICONS = { sdr: Users, founders: Rocket, agencies: Building2, scaleup: Target } as const;
const USE_CASE_KEYS = ["sdr", "founders", "agencies", "scaleup"] as const;

export default async function SolucionesPage() {
  const t = await getTranslations("legalMarketing.soluciones");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">{t("heroSubtitle")}</p>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {USE_CASE_KEYS.map((key) => {
              const Icon = USE_CASE_ICONS[key];
              return (
                <div key={key} className="bee-bento bee-bento-pad-lg">
                  <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                    <Icon className="size-4.5 stroke-[1.5] text-[var(--color-chart-4)]" />
                  </div>
                  <h2 className="mt-3 text-base font-semibold tracking-tight">
                    {t(`useCases.${key}.audience`)}
                  </h2>
                  <p className="bee-micro mt-2 uppercase tracking-wide text-[var(--color-chart-5)]">
                    {t("problemLabel")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{t(`useCases.${key}.pain`)}</p>
                  <p className="bee-micro mt-3 uppercase tracking-wide text-[var(--color-chart-4)]">
                    {t("fitLabel")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{t(`useCases.${key}.fit`)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("closingTitle")}
            </h2>
            <Link href="/contacto?source=soluciones" className="bee-btn bee-btn--primary">
              {t("ctaStart")} <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
