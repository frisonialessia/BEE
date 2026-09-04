import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LandingDemo } from "@/components/marketing/landing-demo";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Reveal } from "@/components/marketing-motion";
import { MarketingSales } from "@/components/marketing-sales";

/**
 * Landing pública — six blocks, one image:
 *   1. floating nav;
 *   2. hero — headline in ink, one line, one primary button, one quiet link;
 *   3. the product — the Señales page drawn with BEE's own components over
 *      the sandbox's sample data (LandingDemo), right under the hero;
 *   4. three sentences — the signal arrives · BEE prepares the play · you
 *      decide — text only, no cards, no icons;
 *   5. Ventas — the difference against a CRM and against an intent tool,
 *      with the simulator on white (MarketingSales);
 *   6. FAQ, one closing line with the same button, footer.
 *
 * Color: text and icons are ink; blue only on the primary button; brand
 * hues only on chart marks and chip backgrounds; every ground is the page
 * background or a white card, except the hero's faint lavender wash.
 * Nothing names where signals come from and no number is invented: the
 * demo reads the same sample data the sandbox uses.
 */

/** Faint lavender wash, hero only — see .bee-hero-wash in globals.css. */
function HeroAtmosphere() {
  return <div className="bee-hero-wash" aria-hidden />;
}

const STEPS = ["signal", "play", "decide"] as const;

export default async function Home() {
  const t = await getTranslations("marketing.landing");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        {/* ── Hero + the product ──────────────────────────────────────── */}
        <section className="relative -mt-[4.25rem] overflow-hidden pt-[4.25rem]">
          <HeroAtmosphere />
          <div className="relative mx-auto w-full max-w-3xl px-6 pb-8 pt-16 text-center sm:pt-24">
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

        {/* ── Three sentences ─────────────────────────────────────────── */}
        <section id="como-funciona" className="border-t border-border">
          <Reveal className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-24">
            <p className="bee-eyebrow">{t("steps.eyebrow")}</p>
            <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
              {STEPS.map((step) => (
                <div key={step} className="min-w-0">
                  <p className="bee-caption tabular-nums">{t(`steps.${step}.n`)}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">{t(`steps.${step}.title`)}</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">{t(`steps.${step}.text`)}</p>
                </div>
              ))}
            </div>
          </Reveal>
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
