import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Activity, ArrowRight, Briefcase, CalendarDays, Radio, Target, TrendingUp, Trophy } from "lucide-react";

import { FeatureChart, FEATURE_HUE, type FeatureId } from "@/components/marketing-feature-charts";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Reveal } from "@/components/marketing-motion";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legalMarketing.funcionalidades.meta");
  return { title: t("title"), description: t("description") };
}

/**
 * Página pública de funcionalidades — el producto módulo por módulo, en el
 * mismo orden que el dashboard (Señales, CRM, Estrategias, Pronóstico,
 * Ventas, Calendario, Control). Cada banda: título corto + UNA línea +
 * tres chips de un lado, y del otro un gráfico REAL del dashboard (los
 * mismos componentes de src/components/charts) con datos de ejemplo,
 * dentro de una tarjeta. Lados alternados, un tono por banda (índigo →
 * miel → lila → magenta; verde solo en Ventas, como en el producto).
 * Cada capacidad descripta existe de verdad — nada aspiracional — y cada
 * tarjeta dice que sus cifras son de ejemplo.
 */

const SECTIONS: ReadonlyArray<{ id: FeatureId; icon: typeof Radio }> = [
  { id: "senales", icon: Radio },
  { id: "crm", icon: Briefcase },
  { id: "estrategias", icon: Target },
  { id: "pronostico", icon: TrendingUp },
  { id: "ventas", icon: Trophy },
  { id: "calendario", icon: CalendarDays },
  { id: "control", icon: Activity },
];

export default async function FuncionalidadesPage() {
  const t = await getTranslations("legalMarketing.funcionalidades");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 pb-4 pt-16 text-center sm:pt-20">
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t("heroTitle")}</h1>
          <p className="bee-caption mx-auto mt-4 max-w-xl text-base">{t("heroSubtitle")}</p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-12 lg:pb-14">
          {SECTIONS.map(({ id, icon: Icon }, i) => {
            const hue = FEATURE_HUE[id];
            const ink = hue;
            const chips = t.raw(`sections.${id}.chips`) as string[];
            const flip = i % 2 === 1;
            return (
              <Reveal key={id} className="grid scroll-mt-20 grid-cols-1 items-center gap-8 py-12 lg:grid-cols-2 lg:gap-16 lg:py-14">
                <div id={id} className={flip ? "lg:order-2" : ""}>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${hue} 20%, var(--color-card))`, color: ink }}
                    >
                      <Icon className="size-4 stroke-[1.5]" />
                    </span>
                    <p className="bee-eyebrow" style={{ color: ink }}>
                      {t(`sections.${id}.eyebrow`)}
                    </p>
                  </div>
                  <h2 className="mt-4 max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">{t(`sections.${id}.title`)}</h2>
                  <p className="bee-caption mt-3 max-w-md">{t(`sections.${id}.caption`)}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <li
                        key={chip}
                        className="rounded-full px-3 py-1 text-xs font-medium text-[var(--color-text)]"
                        style={{ background: `color-mix(in srgb, ${hue} 18%, var(--color-card))` }}
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`bee-bento bee-bento-pad flex flex-col gap-3 ${flip ? "lg:order-1" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{t(`sections.${id}.chart.title`)}</p>
                    <span className="bee-micro">{t("demoBadge")}</span>
                  </div>
                  {/* Fixed chart box — the dashboard charts fill it (useBoxSize). */}
                  <div className="flex h-[220px] flex-col">
                    <FeatureChart id={id} />
                  </div>
                </div>
              </Reveal>
            );
          })}
          <p className="bee-micro mt-2 text-center">{t("demoNote")}</p>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-12 text-center lg:py-14">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">{t("closingTitle")}</h2>
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
