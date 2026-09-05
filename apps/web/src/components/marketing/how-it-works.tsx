import { Reveal } from "@/components/marketing-motion";
import { TONE, tint } from "@/components/charts/palette";
import { getSignalTypeLabels } from "@/lib/format";
import type { Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";

/**
 * "Cómo funciona" — antes vivía en el hero de la landing; se mudó aquí
 * cuando la landing pasó a una sola pantalla sin scroll (ver page.tsx) y
 * dejó de tener espacio para nada más allá del hero + el bento. Sigue
 * siendo el mismo contenido, mismas claves de traducción
 * (`marketing.landing.hero.differentiators` y `marketing.landing.steps`):
 * primero las tres afirmaciones de mecanismo (por qué BEE no es un CRM ni
 * una herramienta de intención), luego las tres tarjetas numeradas con una
 * pieza gráfica real de BEE cada una en vez de solo texto.
 */

const STEPS = ["signal", "play", "decide"] as const;
const HERO_DIFFERENTIATORS = ["lead", "play", "learn"] as const;
const STEP_SIGNAL_TYPES = ["funding_round", "hiring", "tech_adoption"] as const;
const STEP_FUNNEL_TONES = ["var(--color-chart-3)", "var(--color-chart-1)", "var(--color-chart-4)"];
const STEP_FUNNEL_WIDTHS = [100, 62, 34];

export async function HowItWorks({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing.landing");
  const tHero = await getTranslations("landing.hero.differentiators");
  const signalTypeLabels = getSignalTypeLabels(locale);

  return (
    <section id="como-funciona" className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-24">
        <Reveal className="grid grid-cols-1 gap-6 text-left sm:grid-cols-3 sm:gap-8 sm:text-center">
          {HERO_DIFFERENTIATORS.map((key) => (
            <div key={key}>
              <p className="text-base font-semibold leading-snug">{tHero(`${key}.title`)}</p>
              <p className="bee-caption mt-1 leading-snug">{tHero(`${key}.text`)}</p>
            </div>
          ))}
        </Reveal>

        <Reveal delay={60}>
          <p className="bee-eyebrow mt-14">{t("steps.eyebrow")}</p>
        </Reveal>
        <Reveal stagger className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" delay={100}>
          {STEPS.map((step) => (
            // No `!h-auto` here on purpose: the plain grid row's own
            // stretch (.bee-card's height: 100%) equalizes the three
            // cards to the tallest one's content.
            <div key={step} className="bee-card">
              <p className="bee-caption tabular-nums">{t(`steps.${step}.n`)}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{t(`steps.${step}.title`)}</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-text-muted)]">{t(`steps.${step}.text`)}</p>

              {step === "signal" && (
                <div className="mt-5 flex flex-wrap gap-1.5 border-t border-[var(--color-divider)] pt-4">
                  {STEP_SIGNAL_TYPES.map((type) => (
                    <span key={type} className="rounded-full px-2.5 py-1 text-xs font-medium text-[var(--color-text)]" style={{ background: tint(TONE.market, 45) }}>
                      {signalTypeLabels[type]}
                    </span>
                  ))}
                </div>
              )}

              {step === "play" && (
                <div className="mt-5 border-t border-[var(--color-divider)] pt-4">
                  <div className="flex gap-1.5" aria-hidden>
                    {[1, 2, 3].map((i) => (
                      <i key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < 3 ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
                    ))}
                  </div>
                </div>
              )}

              {step === "decide" && (
                <div className="mt-5 flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-4" aria-hidden>
                  {STEP_FUNNEL_WIDTHS.map((w, i) => (
                    <div key={i} className="h-2 rounded-full" style={{ width: `${w}%`, background: STEP_FUNNEL_TONES[i] }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
