import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Lock, Mail, PlayCircle, Radio, Search, ShieldCheck, Star, UserCheck, Users } from "lucide-react";

import { MarketingBeforeAfter } from "@/components/marketing-before-after";
import { MarketingCounters } from "@/components/marketing-counters";
import { MarketingDemoPanel } from "@/components/marketing-demo-panel";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { Reveal } from "@/components/marketing-motion";
import { MarketingOrbit } from "@/components/marketing-orbit";
import { MarketingSalesProof } from "@/components/marketing-sales-proof";
import { MarketingSignalTicker } from "@/components/marketing-signal-ticker";

/**
 * Landing pública — la primera pantalla que ve cualquier visitante antes de
 * autenticarse. Todo el contenido describe capacidades reales ya
 * implementadas (cada enlace apunta a una ruta real del dashboard) — nada
 * de logos de clientes ni métricas inventadas: la sección de autoridad se
 * apoya en garantías técnicas verificables del sistema en vez de prueba
 * social fabricada.
 *
 * Order, and the reason for it — a visitor should know what BEE is within
 * two scrolls: the hero says it (headline, subtitle, CTAs, the four tilted
 * module cards as the module summary), the ticker shows the signals, the
 * Demo en vivo shows the product. Then the argument: Antes/después,
 * Ventas, why to trust it (with the real sources), FAQ, closing CTA. The
 * module tour lives on /funcionalidades (linked from header and footer),
 * not here.
 *
 * i18n: this file's own copy (hero, confianza, CTA de cierre) lives in
 * messages/{locale}/marketing.json; every sub-component below reads
 * messages/{locale}/landing.json.
 *
 * Motion is restraint: one plain fade + 12px rise per section (Reveal,
 * staggered for lists), the chart drawing itself once, figures counting
 * up once, and never more than one animated element per viewport. All of
 * it is progressive enhancement over this server-rendered final state,
 * and none of it adds a fill: one background for the whole landing, the
 * hero's blurred atmosphere the only exception.
 */

const GUARANTEE_ICONS = {
  noHallucinations: ShieldCheck,
  humanApproval: UserCheck,
  multiTenant: Lock,
  secureByDesign: Radio,
} as const;
const GUARANTEE_KEYS = ["noHallucinations", "humanApproval", "multiTenant", "secureByDesign"] as const;
// Icon disc per row: a soft wash of the hue behind an ink mixed toward
// --color-text (same recipe as .bee-eyebrow's modifiers) so it reads on
// white. Written out in full rather than through a shared custom property:
// Lightning CSS constant-folds a color-mix()-only custom property into every
// CSS rule that reads it and drops the property itself, so a var() written
// from inline style (invisible to that pass) would resolve to nothing.
const GUARANTEE_HUES = ["var(--color-chart-4)", "var(--color-accent-warm)", "var(--color-chart-6)", "var(--color-chart-5)"] as const;

/** The real signal sources and the outbound channel — LinkedIn/G2/Google
 * Search are the providers in apps/api/app/services/external_api/providers/,
 * email goes out via SMTP/SendGrid/Resend. Names are proper nouns (not
 * translated); no third-party logos — the repo has none as assets and
 * claiming affiliation is not ours to make. */
const SOURCES = [
  { id: "linkedin", name: "LinkedIn", icon: Users, hue: "var(--color-chart-4)" },
  { id: "g2", name: "G2", icon: Star, hue: "var(--color-accent-warm)" },
  { id: "googleSearch", name: "Google Search", icon: Search, hue: "var(--color-chart-6)" },
  { id: "email", name: "Email", icon: Mail, hue: "var(--color-chart-5)" },
] as const;

/** Faint white points over the landing — like distant stars, the only
 * motion on the shared ground. Fixed positions (no randomness: server and
 * client must agree), each with its own delay/duration so the twinkle
 * never reads as a loop. [left%, top%, delay s, duration s]. */
const SPARKLES = [
  [5, 9, 0, 11], [17, 26, 2.5, 13], [29, 7, 5, 12], [41, 21, 1.5, 14], [56, 12, 3.5, 11.5],
  [68, 29, 6, 12.5], [83, 8, 0.8, 13.5], [94, 24, 4.2, 11], [9, 47, 2, 12], [24, 58, 5.5, 13],
  [46, 44, 0.4, 14], [62, 52, 3, 11.5], [77, 46, 6.5, 12.5], [91, 60, 1.2, 13], [13, 76, 4.8, 11],
  [33, 88, 0.2, 12.5], [51, 71, 2.8, 13.5], [70, 84, 5.2, 11.5], [86, 92, 3.8, 14], [97, 77, 1.8, 12],
] as const;

function MarketingSparkles() {
  return (
    <div className="bee-sparkles" aria-hidden>
      {SPARKLES.map(([left, top, delay, duration], i) => (
        <i key={i} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` }} />
      ))}
    </div>
  );
}

/** Manchas de gradiente detrás del hero — mezcla de la paleta institucional,
 * blureadas y de baja opacidad para que el texto #222222 siga siendo
 * perfectamente legible encima. Puro CSS, sin imagen ni librería. */
function HeroAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 -top-32 size-[26rem] rounded-full bg-[var(--color-chart-4)]/35 blur-3xl" />
      <div className="absolute -right-16 -top-20 size-[22rem] rounded-full bg-[var(--color-chart-5)]/30 blur-3xl" />
      <div className="absolute left-1/3 top-24 size-[20rem] rounded-full bg-[var(--color-chart-2)]/20 blur-3xl" />
      <div className="absolute -bottom-24 right-1/4 size-[24rem] rounded-full bg-[var(--color-chart-6)]/25 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
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
  const tSources = await getTranslations("landing.integrations.items");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        <MarketingSparkles />
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <HeroAtmosphere />

          <div className="relative mx-auto w-full max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
            {/* .bee-hero-in: eyebrow → headline (word by word) → subtitle →
             * CTAs rise in on load, 60 ms apart. */}
            <div className="bee-hero-in relative">
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="bee-headline mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                <HeroHeadline raw={t.raw("heroTitle") as string} />
              </h1>
              <p className="bee-caption mx-auto mt-6 max-w-xl text-base sm:text-lg">{t("heroSubtitle")}</p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link href="/contacto?source=hero_primary" className="bee-btn bee-btn--primary">
                  {t("ctaStart")} <ArrowRight className="size-4" />
                </Link>
                <Link href="/probar" className="bee-btn-ghost">
                  <PlayCircle className="size-4" /> {t("ctaTry")}
                </Link>
              </div>
            </div>
          </div>

          {/* pb-12/pt-2 here, not the pb-20/pt-10 you'd expect for this much
           * visual breathing room — MarketingOrbit already reserves its own
           * py-8 internally (needed so its tilted cards' overshoot doesn't
           * get clipped, see the comment there), so stacking full padding
           * here on top of that would double up and push the section much
           * taller than intended. The four tilted cards are the module
           * summary of this page; the full tour is /funcionalidades. */}
          <div className="relative pb-12 pt-2 sm:pb-16">
            <MarketingOrbit />
          </div>
        </section>

        <MarketingSignalTicker />

        {/* ── Vista previa del producto ───────────────────────────────────── */}
        <section id="producto" className="mx-auto w-full max-w-6xl px-6 py-12 lg:py-14">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow bee-eyebrow--blue">{t("demoEyebrow")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("demoTitle")}</h2>
          </Reveal>
          <Reveal className="mt-10" delay={100}>
            <MarketingDemoPanel />
          </Reveal>
          {/* The demo's own figures, counting up once — a recap of the panel
           * above, labelled as demo data, not a second set of statistics. */}
          <MarketingCounters />
        </section>

        <MarketingBeforeAfter />

        <MarketingSalesProof />

        {/* ── Por qué confiar — editorial block, no cards ───────────────── */}
        <section id="features" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-12 lg:py-14">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
              <Reveal className="lg:col-span-5">
                <p className="bee-eyebrow bee-eyebrow--warm">{t("guaranteesEyebrow")}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("guaranteesTitle")}</h2>
                <p className="bee-caption mt-3 max-w-md">{t("guaranteesSubtitle")}</p>
              </Reveal>

              <Reveal as="ol" stagger className="divide-y divide-border border-y border-border lg:col-span-7">
                {GUARANTEE_KEYS.map((key, i) => {
                  const Icon = GUARANTEE_ICONS[key];
                  const hue = GUARANTEE_HUES[i];
                  return (
                    <li key={key} className="grid grid-cols-[1.5rem_2rem_1fr] items-start gap-4 py-5">
                      <span className="bee-micro pt-2 tabular-nums">0{i + 1}</span>
                      <span
                        className="flex size-8 items-center justify-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${hue} 20%, var(--color-card))`, color: `color-mix(in srgb, ${hue} 70%, var(--color-text) 30%)` }}
                      >
                        <Icon className="size-4 stroke-[1.5]" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight">{t(`guarantees.${key}.title`)}</h3>
                        <p className="bee-caption mt-1">{t(`guarantees.${key}.description`)}</p>
                      </div>
                    </li>
                  );
                })}
                {/* Footer row: where the signals actually come from — the
                 * same trust theme, the four real sources, one line. */}
                <li className="grid grid-cols-[1.5rem_1fr] items-start gap-4 py-5">
                  <span className="bee-micro pt-0.5 tabular-nums">0{GUARANTEE_KEYS.length + 1}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="bee-micro">{t("sourcesLabel")}</span>
                    {SOURCES.map((source, i) => (
                      <span key={source.id} className="inline-flex items-center gap-2">
                        {i > 0 && <span className="bee-micro" aria-hidden>·</span>}
                        <span
                          className="flex size-6 items-center justify-center rounded-full"
                          style={{ background: `color-mix(in srgb, ${source.hue} 20%, var(--color-card))`, color: `color-mix(in srgb, ${source.hue} 70%, var(--color-text) 30%)` }}
                          title={tSources(source.id)}
                        >
                          <source.icon className="size-3 stroke-[1.75]" />
                        </span>
                        <span className="text-sm font-medium">{source.name}</span>
                      </span>
                    ))}
                  </div>
                </li>
              </Reveal>
            </div>
          </div>
        </section>

        <div className="border-t border-border">
          <MarketingFAQ />
        </div>

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-12 text-center lg:py-14">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">{t("closingTitle")}</h2>
            <Link href="/contacto?source=closing_cta" className="bee-btn bee-btn--primary">
              {t("closingCta")} <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
