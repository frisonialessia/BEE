import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Lock,
  PlayCircle,
  Radio,
  ShieldCheck,
  Share2,
  Sparkles,
  TrendingUp,
  UserCheck,
} from "lucide-react";

import { MarketingBeforeAfter } from "@/components/marketing-before-after";
import { MarketingCounters } from "@/components/marketing-counters";
import { MarketingDemoPanel } from "@/components/marketing-demo-panel";
import { MarketingFAQ } from "@/components/marketing-faq";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingHeroSignals } from "@/components/marketing-hero-signals";
import { MarketingHowItWorks } from "@/components/marketing-how-it-works";
import { MarketingIntegrations } from "@/components/marketing-integrations";
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
 * i18n: this file's own copy (hero, módulos, garantías, CTA de cierre)
 * lives in messages/{locale}/marketing.json; every sub-component below
 * reads messages/{locale}/landing.json.
 *
 * Motion: the landing is a scroll story (see marketing-motion.tsx). Every
 * section reveals with the same fade + 12px rise, grids stagger their
 * children, figures count up, the Ventas chart draws itself and the
 * how-it-works section is a pinned sequence driven by scroll position.
 * All of it is progressive enhancement over this server-rendered final
 * state — no JS, no IntersectionObserver or prefers-reduced-motion all
 * get the finished page — and none of it adds a fill: one background for
 * the whole landing, the hero's blurred atmosphere the only exception.
 */

const MODULE_ICONS = { signals: Radio, brief: Sparkles, simulator: TrendingUp, automation: Share2 } as const;
const MODULE_HREFS = {
  signals: "/funcionalidades#senales",
  brief: "/funcionalidades#brief",
  simulator: "/funcionalidades#simulador",
  automation: "/funcionalidades#automatizacion",
} as const;
const MODULE_TONES = {
  signals: "bee-bento--primary",
  brief: "bee-bento--warm",
  simulator: "bee-bento--violet",
  automation: "bee-bento--muted",
} as const;
// Stroke color for each module's icon + background motif — chart-4 (blue)
// reads fine directly on its own wash, the other three need mixing toward
// --color-text (same recipe as .bee-eyebrow's modifiers in globals.css) or
// they wash out against their own tint. Written out in full rather than
// through a shared custom property: Lightning CSS constant-folds a
// color-mix()-only custom property into every CSS rule that reads it and
// drops the property itself, so a var() written from inline style/JSX
// (invisible to that optimization pass) resolves to nothing.
const MODULE_STROKES = {
  signals: "var(--color-chart-4)",
  brief: "color-mix(in srgb, var(--color-accent-warm) 70%, var(--color-text) 30%)",
  simulator: "color-mix(in srgb, var(--color-chart-6) 65%, var(--color-text) 35%)",
  automation: "color-mix(in srgb, var(--color-chart-5) 70%, var(--color-text) 30%)",
} as const;
const MODULE_SPANS = {
  signals: "bee-span-8",
  brief: "bee-span-4",
  simulator: "bee-span-4",
  automation: "bee-span-8",
} as const;
const MODULE_KEYS = ["signals", "brief", "simulator", "automation"] as const;

const GUARANTEE_ICONS = {
  noHallucinations: ShieldCheck,
  humanApproval: UserCheck,
  multiTenant: Lock,
  secureByDesign: Radio,
} as const;
const GUARANTEE_KEYS = ["noHallucinations", "humanApproval", "multiTenant", "secureByDesign"] as const;
// Guarantees reads as a trust/security section, not a product tour — a
// full-color wash there (the old GUARANTEE_TONES, reusing MODULE_TONES)
// competes with Platform's cards for the same visual trick right above it.
// Cards are white with a 3px accent bar instead (see .bee-bar-card in
// globals.css); the accent still cycles through the same 4-tone order.
const GUARANTEE_BAR_TONES = [
  "bee-bar-card--primary",
  "bee-bar-card--warm",
  "bee-bar-card--violet",
  "bee-bar-card--muted",
] as const;
const GUARANTEE_ICON_STROKES = [
  "var(--color-chart-4)",
  "color-mix(in srgb, var(--color-accent-warm) 70%, var(--color-text) 30%)",
  "color-mix(in srgb, var(--color-chart-6) 65%, var(--color-text) 35%)",
  "color-mix(in srgb, var(--color-chart-5) 70%, var(--color-text) 30%)",
] as const;

/** White glints over the landing — the only motion on the shared ground.
 * Fixed positions (no randomness: server and client must agree), each with
 * its own delay/duration so the twinkle never reads as a loop. */
const SPARKLES = [
  [6, 14, 0, 7.5], [22, 31, 1.8, 8.5], [41, 19, 3.1, 7], [58, 27, 0.9, 9], [77, 12, 2.4, 8],
  [91, 34, 4.2, 7.5], [12, 52, 1.2, 8.8], [35, 61, 3.6, 7.2], [63, 55, 0.4, 9.4], [86, 63, 2.9, 8.1],
  [8, 82, 3.9, 7.8], [29, 90, 1.5, 8.6], [52, 79, 4.6, 7.3], [72, 93, 0.7, 9.1], [95, 84, 2.1, 8.3],
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

/** Subtle background motif per module card — a corner flourish, not a
 * full-bleed pattern, so it survives the cards' variable content height
 * (fixed pixel size + the card's own overflow-hidden clip it cleanly on
 * short cards, instead of stretching/distorting like a viewBox scaled to
 * fill an unpredictable height would). Hidden below sm: at one column the
 * motif has no spare corner to sit in without crowding the text. */
function ModuleMotif({ module: moduleKey }: { module: (typeof MODULE_KEYS)[number] }) {
  const stroke = MODULE_STROKES[moduleKey];
  const common = "pointer-events-none absolute hidden sm:block";
  switch (moduleKey) {
    case "signals":
      // Radiating pulse — signals arriving.
      return (
        <svg className={`${common} -right-6 -top-8 size-40`} viewBox="0 0 160 160" fill="none" aria-hidden>
          <circle cx="80" cy="80" r="18" style={{ stroke }} strokeWidth="1.5" opacity="0.35" />
          <circle cx="80" cy="80" r="34" style={{ stroke }} strokeWidth="1.5" opacity="0.25" />
          <circle cx="80" cy="80" r="50" style={{ stroke }} strokeWidth="1.5" opacity="0.15" />
          <circle cx="80" cy="80" r="66" style={{ stroke }} strokeWidth="1.5" opacity="0.08" />
        </svg>
      );
    case "brief":
      // Sunrise arc — the morning brief.
      return (
        <svg className={`${common} -bottom-10 -right-4 size-36`} viewBox="0 0 144 144" fill="none" aria-hidden>
          <path d="M-8 112a80 80 0 0 1 160 0" style={{ stroke }} strokeWidth="1.5" opacity="0.3" />
          <circle cx="72" cy="112" r="20" style={{ fill: stroke }} opacity="0.14" />
        </svg>
      );
    case "simulator":
      // Ascending bars — the revenue projection.
      return (
        <svg className={`${common} -bottom-6 -right-4 size-32`} viewBox="0 0 128 128" fill="none" aria-hidden>
          <rect x="76" y="82" width="13" height="38" rx="2" style={{ fill: stroke }} opacity="0.18" />
          <rect x="96" y="62" width="13" height="58" rx="2" style={{ fill: stroke }} opacity="0.26" />
          <rect x="116" y="34" width="13" height="86" rx="2" style={{ fill: stroke }} opacity="0.34" />
        </svg>
      );
    case "automation":
      // Connected nodes — sequences advancing on their own.
      return (
        <svg className={`${common} -right-6 -top-6 size-36`} viewBox="0 0 144 144" fill="none" aria-hidden>
          <circle cx="96" cy="30" r="4" style={{ fill: stroke }} opacity="0.4" />
          <circle cx="120" cy="58" r="4" style={{ fill: stroke }} opacity="0.4" />
          <circle cx="96" cy="86" r="4" style={{ fill: stroke }} opacity="0.4" />
          <path d="M96 30 96 86 M96 58 120 58" style={{ stroke }} strokeWidth="1.5" opacity="0.28" />
        </svg>
      );
  }
}

export default async function Home() {
  const t = await getTranslations("marketing.landing");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MarketingHeader />

      <main className="relative flex-1">
        <MarketingSparkles />
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <HeroAtmosphere />

          <div className="relative mx-auto w-full max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
            {/* Floating signal cards in the side margins (xl+ only). Outside
             * .bee-hero-in so the load-in stagger below doesn't fight their
             * own parallax transform. */}
            <MarketingHeroSignals />
            {/* .bee-hero-in: eyebrow → headline → subtitle → CTAs rise in on
             * load, 90 ms apart; the <hl> words get a honey marker that draws
             * itself under them once the headline has landed. */}
            <div className="bee-hero-in relative">
              <p className="bee-eyebrow">{t("eyebrow")}</p>
              <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {t.rich("heroTitle", { hl: (chunks) => <span className="bee-hl">{chunks}</span> })}
              </h1>
              <p className="bee-caption mx-auto mt-6 max-w-xl text-base sm:text-lg">{t("heroSubtitle")}</p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link href="/contacto?source=hero_primary" className="bee-btn bee-btn--primary bee-cta-glow">
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
           * taller than intended. */}
          <div className="relative pb-12 pt-2 sm:pb-16">
            <MarketingOrbit />
          </div>
        </section>

        <MarketingSignalTicker />

        {/* ── Vista previa del producto ───────────────────────────────────── */}
        <section id="producto" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow bee-eyebrow--blue">{t("demoEyebrow")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("demoTitle")}</h2>
          </Reveal>
          <Reveal className="mt-10" delay={100}>
            <MarketingDemoPanel />
          </Reveal>
          {/* The demo's own figures, counting up — a recap of the panel
           * above, labelled as demo data, not a second set of statistics. */}
          <MarketingCounters />
        </section>

        <MarketingHowItWorks />

        <MarketingBeforeAfter />

        <MarketingSalesProof />

        {/* ── Módulos de valor ─────────────────────────────────────────────── */}
        <section id="modulos" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <p className="bee-eyebrow bee-eyebrow--blue">{t("modulesEyebrow")}</p>
              <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("modulesTitle")}
              </h2>
            </Reveal>
            <Reveal stagger className="bee-bento-grid mt-10">
              {MODULE_KEYS.map((key) => {
                const Icon = MODULE_ICONS[key];
                return (
                  <Link
                    key={key}
                    href={MODULE_HREFS[key]}
                    className={`${MODULE_SPANS[key]} bee-bento bee-bento-pad bee-glass--hover group relative block overflow-hidden ${MODULE_TONES[key]}`}
                  >
                    <ModuleMotif module={key} />
                    <div className="relative flex h-full gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                        <Icon className="size-5 stroke-[1.5]" style={{ color: MODULE_STROKES[key] }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight">{t(`modules.${key}.title`)}</h3>
                        <p className="bee-caption mt-1.5">{t(`modules.${key}.description`)}</p>
                        <span
                          className="mt-3 inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ color: MODULE_STROKES[key] }}
                        >
                          {t("modulesExplore")} <ArrowRight className="size-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </Reveal>
          </div>
        </section>

        <MarketingIntegrations />

        {/* ── Autoridad / garantías del sistema ───────────────────────────── */}
        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="bee-eyebrow bee-eyebrow--warm">{t("guaranteesEyebrow")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("guaranteesTitle")}</h2>
            <p className="bee-caption mt-3">{t("guaranteesSubtitle")}</p>
          </Reveal>

          <Reveal stagger className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEE_KEYS.map((key, i) => {
              const Icon = GUARANTEE_ICONS[key];
              return (
                <div
                  key={key}
                  className={`bee-bento bee-bento-pad bee-bar-card bee-glass--hover ${GUARANTEE_BAR_TONES[i]}`}
                >
                  <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-background">
                    <Icon className="size-4.5 stroke-[1.5]" style={{ color: GUARANTEE_ICON_STROKES[i] }} />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold tracking-tight">{t(`guarantees.${key}.title`)}</h3>
                  <p className="bee-caption mt-1.5">{t(`guarantees.${key}.description`)}</p>
                </div>
              );
            })}
          </Reveal>
        </section>

        <MarketingFAQ />

        {/* ── CTA de cierre ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">{t("closingTitle")}</h2>
            <Link href="/contacto?source=closing_cta" className="bee-btn bee-btn--primary bee-cta-glow">
              {t("closingCta")} <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
