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
 * (`marketing.landing.steps`): tres tarjetas numeradas, cada una con una
 * pieza gráfica real de BEE en vez de solo texto.
 *
 * Antes traía además una tira de tres afirmaciones de mecanismo
 * (`marketing.landing.hero.differentiators`) justo encima. Se quitó: decía
 * lo mismo que las tres tarjetas de debajo, con otras palabras, y las
 * tarjetas de /funcionalidades ya lo dicen una tercera vez más arriba en la
 * misma página. Tres veces el mismo mensaje es una pantalla de scroll que
 * no informa.
 */

const STEPS = ["signal", "play", "decide"] as const;
const STEP_SIGNAL_TYPES = ["funding_round", "hiring", "tech_adoption"] as const;
const STEP_FUNNEL_WIDTHS = [100, 62, 34];

/** Un tono BEE por paso, el mismo que lleva ese módulo en el producto:
 *  la señal es miel, la jugada es lila (lo que BEE prepara) y la decisión
 *  es índigo (pronóstico y equipo). Antes las tres tarjetas eran blancas y
 *  la del medio dibujaba sus barras en tinta, así que la fila entera se
 *  leía como un bloque de texto gris. */
const STEP_TONE: Record<string, string> = {
  signal: TONE.market,
  play: TONE.prepared,
  decide: TONE.forecast,
};

export async function HowItWorks({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing.landing");
  const signalTypeLabels = getSignalTypeLabels(locale);

  return (
    <section id="como-funciona" className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-12">
        <Reveal>
          <p className="bee-eyebrow">{t("steps.eyebrow")}</p>
        </Reveal>
        <Reveal stagger className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" delay={100}>
          {STEPS.map((step) => (
            // No `!h-auto` here on purpose: the plain grid row's own
            // stretch (.bee-card's height: 100%) equalizes the three
            // cards to the tallest one's content.
            <div key={step} className="bee-card" style={{ borderTop: `3px solid ${STEP_TONE[step]}` }}>
              <span
                className="grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums"
                style={{ background: tint(STEP_TONE[step], 45) }}
              >
                {t(`steps.${step}.n`)}
              </span>
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
                    {[100, 70, 45].map((level, i) => (
                      <i
                        key={i}
                        className="h-2 flex-1 rounded-full"
                        style={{ background: tint(STEP_TONE.play, level as 100 | 70 | 45) }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {step === "decide" && (
                <div className="mt-5 flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-4" aria-hidden>
                  {STEP_FUNNEL_WIDTHS.map((w, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-full"
                      style={{ width: `${w}%`, background: tint(STEP_TONE.decide, [100, 70, 45][i] as 100 | 70 | 45) }}
                    />
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
