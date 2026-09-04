import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, PlayCircle } from "lucide-react";

import { MarketingCounters } from "@/components/marketing-counters";
import { MarketingDemoPanel } from "@/components/marketing-demo-panel";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Reveal } from "@/components/marketing-motion";
import { MarketingSalesProof } from "@/components/marketing-sales-proof";
import { MarketingTrustCards } from "@/components/marketing-trust-cards";

/**
 * Landing pública — la primera pantalla que ve cualquier visitante antes de
 * autenticarse. Todo el contenido describe capacidades reales ya
 * implementadas (cada enlace apunta a una ruta real del dashboard) — nada
 * de logos de clientes ni métricas inventadas: la sección de autoridad se
 * apoya en garantías técnicas verificables del sistema en vez de prueba
 * social fabricada.
 *
 * Order, and the reason for it — a visitor should know what BEE is within
 * one scroll: a floating nav, then the hero says it (headline, subtitle,
 * two CTAs) and SHOWS it right underneath — the hero shot is the product
 * itself (MarketingDemoPanel, the "Cerebro de BEE", with its tabs) in one
 * floating card, followed by four honest stat cards. Then the argument:
 * Ventas, why to trust it (five dashboard chart cards, the real sources
 * among them), FAQ, closing CTA. The module tour lives on /funcionalidades.
 *
 * i18n: this file's own copy (hero, confianza, CTA de cierre) lives in
 * messages/{locale}/marketing.json; every sub-component below reads
 * messages/{locale}/landing.json.
 *
 * Ground and motion are restraint: one page background for everything
 * outside the hero; the hero alone gets a light lavender wash and two
 * blurred blobs in pure BEE tokens (.bee-hero-wash). Motion is Reveal's
 * fade + 12px rise per section, the charts drawing themselves once, the
 * figures counting up once — nothing floating, no parallax, no cursor
 * effects. All of it is progressive enhancement over this server-rendered
 * final state.
 */

/** Ethereal ground for the hero only — see .bee-hero-wash in globals.css:
 * a wash from light lavender to the page background and two soft blobs,
 * honey and lavender, each a single token (never a blend of two hues). */
function HeroAtmosphere() {
  return (
    <div className="bee-hero-wash" aria-hidden>
      <i />
      <i />
    </div>
  );
}

/**
 * Headline split into words so they can rise in one after another (a
 * calm 35 ms stagger, ≤ 600 ms in total — see .bee-word). The message is
 * parsed here (not via t.rich) because each WORD needs its own span:
 * `<hl>…</hl>` marks the highlighted phrase, whose words get the last
 * indices so they land last. Pure string work on the server — identical
 * output on the client, nothing to hydrate but static spans.
 */
function HeroHeadline({ raw }: { raw: string }) {
  const parts = raw.split(/(<hl>.*?<\/hl>)/).filter((p) => p.length > 0);
  const plainCount = parts.filter((p) => !p.startsWith("<hl>")).reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);
  let plainIndex = 0;
  let hlIndex = plainCount;
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, pi) => {
    const isHl = part.startsWith("<hl>");
    const text = isHl ? part.slice(4, -5) : part;
    const words = text.split(/\s+/).filter(Boolean);
    if (pi > 0 && (/^\s/.test(text) || /\s$/.test(parts[pi - 1].replace(/<\/?hl>/g, "")))) nodes.push(" ");
    const spans = words.map((word, wi) => {
      const i = isHl ? hlIndex++ : plainIndex++;
      return (
        <span key={`${pi}-${wi}`}>
          {wi > 0 && " "}
          <span className="bee-word" style={{ "--i": i } as React.CSSProperties}>
            {word}
          </span>
        </span>
      );
    });
    nodes.push(
      isHl ? (
        <span key={pi} className="bee-hl">
          {spans}
        </span>
      ) : (
        <span key={pi}>{spans}</span>
      ),
    );
  });
  return <>{nodes}</>;
}

export default async function Home() {
  const t = await getTranslations("marketing.landing");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────
         * Pulled up under the floating nav (its 3.5rem bar + 0.75rem top
         * gap) so the wash starts at the very top of the page. */}
        <section className="relative -mt-[4.25rem] overflow-hidden pt-[4.25rem]">
          <HeroAtmosphere />

          <div className="relative mx-auto w-full max-w-4xl px-6 pt-16 text-center sm:pt-24">
            {/* .bee-hero-in: eyebrow → headline (word by word) → subtitle →
             * CTAs rise in on load, 60 ms apart. */}
            <div className="bee-hero-in relative">
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="bee-headline mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
                <HeroHeadline raw={t.raw("heroTitle") as string} />
              </h1>
              <p className="bee-caption mx-auto mt-6 max-w-xl text-base">{t("heroSubtitle")}</p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link href="/contacto?source=hero_primary" className="bee-btn bee-btn--primary bee-cta-lift">
                  {t("ctaStart")} <ArrowRight className="size-4" />
                </Link>
                <Link href="/probar" className="bee-btn-ghost bee-cta-lift">
                  <PlayCircle className="size-4" /> {t("ctaTry")}
                </Link>
              </div>
            </div>
          </div>

          {/* ── Hero shot — the product itself, one floating card ─────────
           * MarketingDemoPanel is the "Cerebro de BEE": three tabs of the
           * real dashboard with demo data. Under it, four honest figures
           * (MarketingCounters) and their footnote. */}
          <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-14 lg:pb-28 lg:pt-16">
            <Reveal delay={200}>
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-2xl md:p-6">
                <MarketingDemoPanel />
              </div>
            </Reveal>
            <MarketingCounters />
          </div>
        </section>

        <MarketingSalesProof />

        {/* ── Por qué confiar — five guarantees, each a dashboard chart ──── */}
        <section id="features" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-28">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="bee-eyebrow bee-eyebrow--warm">{t("guaranteesEyebrow")}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("guaranteesTitle")}</h2>
              <p className="bee-caption mt-3">{t("guaranteesSubtitle")}</p>
            </Reveal>

            <div className="mt-10">
              <MarketingTrustCards />
            </div>

            {/* The figures above are demo values — said once, under the grid. */}
            <Reveal className="mt-6 text-center" delay={120}>
              <p className="bee-micro">{t("trustNote")}</p>
            </Reveal>
          </div>
        </section>

        <div className="border-t border-border">
          <MarketingFAQ />
        </div>

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center lg:py-28">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">{t("closingTitle")}</h2>
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
