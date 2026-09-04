import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, PlayCircle } from "lucide-react";

import { MarketingDemoPanel } from "@/components/marketing-demo-panel";
import { MarketingFAQ } from "@/components/marketing-faq";
import { FeatureVisual, type FeatureVisualId } from "@/components/marketing-feature-visuals";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Reveal } from "@/components/marketing-motion";
import { MarketingSales } from "@/components/marketing-sales";

/**
 * Landing pública — la primera pantalla que ve cualquier visitante antes de
 * autenticarse. Todo el contenido describe capacidades reales ya
 * implementadas — nada de logos de clientes ni métricas inventadas; las
 * cifras de las vistas son datos de ejemplo y cada vista lo dice.
 *
 * Order, and the reason for it (Linear-style: terse, big type, product
 * first, generous whitespace, hairline dividers):
 *   1. floating nav;
 *   2. hero — eyebrow, headline, one line, two CTAs, tight;
 *   3. the product, right under it — one floating card showing Señales
 *      (MarketingDemoPanel), captioned as illustrative;
 *   4. three feature rows, each one headline + one sentence + a product
 *      visual (FeatureVisual): the signal arrives → BEE prepares the play
 *      → you decide, BEE executes;
 *   5. Ventas, at the end, as the argument: what BEE does that a CRM and
 *      an intent tool don't (MarketingSales), with the simulator;
 *   6. FAQ, closing CTA, footer.
 * The module tour lives on /funcionalidades.
 *
 * Color rules for the whole page: text and icons are ink; blue only on
 * primary buttons; brand hues only on chart marks and chip backgrounds
 * (one hue per box); every ground is the page background or the card,
 * except the hero's faint lavender wash (.bee-hero-wash).
 *
 * i18n: this file's own copy lives in messages/{locale}/marketing.json
 * (marketing.landing.*); every sub-component reads landing.json.
 *
 * Motion is Reveal's fade + 12px rise per section and the hero's load-in —
 * nothing floating, no parallax, no cursor effects.
 */

/** Faint lavender wash, hero only — see .bee-hero-wash in globals.css. */
function HeroAtmosphere() {
  return <div className="bee-hero-wash" aria-hidden />;
}

/**
 * Headline split into words so they can rise in one after another (a
 * calm 35 ms stagger, ≤ 600 ms in total — see .bee-word). Pure string work
 * on the server — identical output on the client, nothing to hydrate but
 * static spans.
 */
function HeroHeadline({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className="bee-word" style={{ "--i": i } as React.CSSProperties}>
            {word}
          </span>
        </span>
      ))}
    </>
  );
}

const FEATURES: ReadonlyArray<{ id: FeatureVisualId; flip: boolean }> = [
  { id: "signal", flip: false },
  { id: "play", flip: true },
  { id: "execute", flip: false },
];

export default async function Home() {
  const t = await getTranslations("marketing.landing");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        {/* ── Hero + the product ───────────────────────────────────────────
         * Pulled up under the floating nav (its 3.5rem bar + 0.75rem top
         * gap) so the wash starts at the very top of the page. */}
        <section className="relative -mt-[4.25rem] overflow-hidden pt-[4.25rem]">
          <HeroAtmosphere />

          <div className="relative mx-auto w-full max-w-4xl px-6 pb-10 pt-20 text-center">
            {/* .bee-hero-in: eyebrow → headline (word by word) → subtitle →
             * CTAs rise in on load, 60 ms apart. */}
            <div className="bee-hero-in relative">
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="bee-headline mx-auto mt-5 max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--color-text)] lg:text-6xl">
                <HeroHeadline text={t("heroTitle")} />
              </h1>
              <p className="bee-caption mx-auto mt-6 max-w-xl text-base">{t("heroSubtitle")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/contacto?source=hero_primary" className="bee-btn bee-btn--primary bee-cta-lift">
                  {t("ctaStart")} <ArrowRight className="size-4" />
                </Link>
                <Link href="/probar" className="bee-btn-ghost bee-cta-lift">
                  <PlayCircle className="size-4" /> {t("ctaTry")}
                </Link>
              </div>
            </div>
          </div>

          {/* ── Demo en vivo — one floating card, Señales only ──────────── */}
          <div className="relative mx-auto mt-8 w-full max-w-6xl px-6 pb-16 lg:pb-20">
            <Reveal delay={200}>
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-2xl md:p-4">
                <MarketingDemoPanel />
              </div>
              <p className="bee-micro mt-4 text-center">{t("demoCaption")}</p>
            </Reveal>
          </div>
        </section>

        {/* ── Three feature rows — one headline, one sentence, the product ── */}
        <section id="features">
          {FEATURES.map(({ id, flip }) => (
            <div key={id} className="border-t border-border">
              <Reveal className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:gap-16">
                <div className={flip ? "lg:order-2" : undefined}>
                  <h2 className="text-balance text-3xl font-semibold tracking-tight">{t(`features.${id}.title`)}</h2>
                  <p className="bee-caption mt-4 max-w-md text-base">{t(`features.${id}.text`)}</p>
                </div>
                <div className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6 ${flip ? "lg:order-1" : ""}`}>
                  <FeatureVisual id={id} />
                </div>
              </Reveal>
            </div>
          ))}
        </section>

        <MarketingSales />

        <div className="border-t border-border">
          <MarketingFAQ />
        </div>

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center lg:py-28">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("closingTitle")}</h2>
            <Link href="/contacto?source=closing_cta" className="bee-btn bee-btn--primary bee-cta-lift">
              {t("closingCta")} <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
