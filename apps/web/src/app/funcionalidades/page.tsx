import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  CheckCircle2,
  Radio,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.funcionalidades.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Página pública dedicada a las funcionalidades — destino de los
 * "Explorar" de los 4 módulos en la landing (ver MODULES en app/page.tsx).
 * Un id por módulo (#senales, #brief, #simulador, #automatizacion) para
 * que cada tarjeta salte directo a su sección. Contenido descriptivo, no
 * las páginas reales del dashboard (que requieren sesión) — mismo criterio
 * que el resto de la landing: cada capacidad descripta acá existe de
 * verdad en el producto, nada aspiracional.
 */

const MODULE_ICONS = { senales: Radio, brief: Sparkles, simulador: TrendingUp, automatizacion: Share2 } as const;
const MODULE_KEYS = ["senales", "brief", "simulador", "automatizacion"] as const;

export default async function FuncionalidadesPage() {
  const t = await getTranslations("legalMarketing.funcionalidades");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 py-16 text-center sm:py-20">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">{t("heroSubtitle")}</p>
        </section>

        <section className="mx-auto w-full max-w-5xl divide-y divide-border px-6 pb-16 sm:pb-20">
          {MODULE_KEYS.map((key, i) => {
            const Icon = MODULE_ICONS[key];
            const points = t.raw(`modules.${key}.points`) as string[];
            return (
              <div
                key={key}
                id={key}
                className="grid scroll-mt-20 grid-cols-1 items-center gap-8 py-14 lg:grid-cols-2 lg:gap-16"
              >
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-primary)]/40">
                    <Icon className="size-5 stroke-[1.5] text-[var(--color-chart-4)]" />
                  </div>
                  <p className="bee-eyebrow mt-4">{t(`modules.${key}.eyebrow`)}</p>
                  <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {t(`modules.${key}.title`)}
                  </h2>
                  <p className="bee-caption mt-3 text-base leading-relaxed">
                    {t(`modules.${key}.description`)}
                  </p>
                </div>

                <div className={`bee-bento bee-bento-pad-lg space-y-3 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  {points.map((point) => (
                    <div key={point} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-chart-4)]" />
                      <p className="text-sm leading-relaxed">{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("closingTitle")}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/contacto?source=funcionalidades" className="bee-btn bee-btn--primary">
                {t("ctaStart")} <ArrowRight className="size-4" />
              </Link>
              <Link href="/#producto" className="bee-btn-ghost">
                {t("ctaDemo")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
