import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { TONE, tint } from "@/components/charts/palette";
import { HeroAtmosphere } from "@/components/marketing/hero-atmosphere";
import { HeroCards } from "@/components/marketing/hero-cards";
import { LandingDemo } from "@/components/marketing/landing-demo";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { CountUp, Reveal } from "@/components/marketing-motion";
import { MarketingSales } from "@/components/marketing-sales";
import { getSignalTypeLabels } from "@/lib/format";
import type { Locale } from "@/i18n/locales";

/**
 * Landing pública — six blocks, one image:
 *   1. floating nav;
 *   2. hero — headline in ink, a fan of real product cards around it on
 *      desktop (HeroCards, over HeroAtmosphere's hex watermark), three
 *      true figures right under the buttons (CountUp);
 *   3. the product — the Señales page drawn with BEE's own components over
 *      the sandbox's sample data (LandingDemo), appearing on scroll;
 *   4. three steps — the signal arrives · BEE prepares the play · you
 *      decide — as three cards, each with a small BEE graphic instead of
 *      a paragraph;
 *   5. Ventas — the difference against a CRM and against an intent tool,
 *      with the simulator on white (MarketingSales);
 *   6. FAQ, one closing line with the same button, footer.
 *
 * Color: text and icons are ink; blue only on buttons; brand hues only on
 * chart marks and chip backgrounds; every ground is the page background or
 * a white card, except the hero's faint lavender wash. Nothing names where
 * signals come from and no number is invented: the hero cards and the demo
 * read the same sample data the sandbox uses, and the three stats under
 * the hero (200 accounts, 5 years, 24h) are true product facts, not
 * simulated ones — no "illustrative" note needed on any of them.
 */

const STEPS = ["signal", "play", "decide"] as const;
const HERO_STATS = ["hive", "history", "reply"] as const;
// Three signal types the "signal" step's chip row shows — a sample, not
// the full taxonomy (see lib/format.ts for the rest).
const STEP_SIGNAL_TYPES = ["funding_round", "hiring", "tech_adoption"] as const;
// The same three CRM-stage hues the pipeline funnel uses (Resumen, CRM
// board) — the "decide" step narrows through the same colors a real
// pipeline does.
const STEP_FUNNEL_TONES = ["var(--color-chart-3)", "var(--color-chart-1)", "var(--color-chart-4)"];
const STEP_FUNNEL_WIDTHS = [100, 62, 34];

export default async function Home() {
  const t = await getTranslations("marketing.landing");
  const tHero = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;
  const signalTypeLabels = getSignalTypeLabels(locale);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        {/* ── Hero + the product ──────────────────────────────────────── */}
        <section className="relative -mt-[4.25rem] overflow-hidden pt-[4.25rem]">
          <HeroAtmosphere />
          <div className="relative mx-auto w-full max-w-3xl px-6 pb-4 pt-16 text-center sm:pt-24 lg:pb-8">
            <HeroCards locale={locale} />
            <div className="bee-hero-in relative">
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="bee-headline mx-auto mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--color-text)] sm:text-5xl lg:text-6xl">
                {t("heroTitle")}
              </h1>
              <p className="bee-caption mx-auto mt-6 max-w-xl text-base">{t("heroSubtitle")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link href="/probar" className="bee-btn bee-btn--primary bee-cta-lift">
                  {t("ctaStart")}
                </Link>
                <a href="#como-funciona" className="bee-btn bee-btn--secondary">
                  {t("ctaHow")}
                </a>
              </div>
            </div>

            <Reveal className="relative mt-12 flex items-start justify-center gap-8 sm:gap-14" delay={60}>
              {HERO_STATS.map((key) => (
                <div key={key} className="w-24 sm:w-32">
                  <p className="text-3xl font-bold tabular-nums sm:text-4xl">
                    <CountUp text={tHero(`stats.items.${key}.value`)} />
                  </p>
                  <p className="bee-caption mt-1 leading-snug">{tHero(`stats.items.${key}.label`)}</p>
                </div>
              ))}
            </Reveal>
          </div>

          <div id="producto" className="relative mx-auto mt-6 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
            <Reveal delay={150}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-[0_24px_80px_-32px_rgba(34,34,34,0.25)] sm:p-3">
                <LandingDemo />
              </div>
              <p className="bee-caption mt-4 text-center">{t("demoCaption")}</p>
            </Reveal>
          </div>
        </section>

        {/* ── Three steps, each with a small BEE graphic ──────────────── */}
        <section id="como-funciona" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-24">
            <Reveal>
              <p className="bee-eyebrow">{t("steps.eyebrow")}</p>
            </Reveal>
            <Reveal stagger className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" delay={60}>
              {STEPS.map((step) => (
                // No `!h-auto` here on purpose: the plain grid row's own
                // stretch (.bee-card's height: 100%) equalizes the three
                // cards to the tallest one's content, so a shorter step
                // (fewer chips, no wrap) still ends flush with the others.
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

        {/* ── Ventas: the difference ──────────────────────────────────── */}
        <MarketingSales />

        <MarketingFAQ />

        {/* ── Closing ─────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <Reveal className="mx-auto w-full max-w-3xl px-6 py-20 text-center lg:py-28">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("closingTitle")}</h2>
            <p className="bee-caption mt-4 text-base">{t("closingText")}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/probar" className="bee-btn bee-btn--primary bee-cta-lift">
                {t("closingCta")}
              </Link>
              <Link href="/contacto?source=closing" className="bee-btn bee-btn--secondary">
                {t("closingSecondary")}
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
