"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { CountUp, Reveal, useReveal } from "@/components/marketing-motion";

/**
 * Landing — "Ventas": the one green section of the site, the same three
 * greens the product reserves for closed revenue (#52c871 · #9cd147 ·
 * #b4e8c5). It argues the thesis with mechanisms, not adjectives: a CRM
 * records what already happened; BEE detects what is about to happen,
 * hands the rep the play, and learns from every close. The chart is
 * illustrative and says so — no invented customer numbers.
 *
 * Motion: the area chart draws itself left→right as it scrolls into view
 * (stroke-dashoffset on the line via pathLength, clip-path on the fill)
 * and the three tiles count up to the copy's own values. Both are armed
 * only after hydration (useReveal / CountUp), so the server HTML — and a
 * reduced-motion visitor — get the finished chart and the final figures.
 */
const REASONS = ["earlier", "play", "priority", "learn"] as const;
const ROWS = ["signal", "play", "pipeline", "goals"] as const;

// Illustrative cumulative closes, 12 points, drawn once (no data source).
const CURVE = [4, 6, 9, 11, 16, 19, 25, 31, 34, 42, 49, 58];

function IllustrativeChart({ state }: { state: "final" | "hidden" | "in" | "done" }) {
  const W = 420;
  const H = 150;
  const padX = 10;
  const padY = 12;
  const max = Math.max(...CURVE);
  const step = (W - padX * 2) / (CURVE.length - 1);
  const pts = CURVE.map((v, i) => [padX + i * step, H - padY - (v / max) * (H - padY * 2)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M${pts[0][0]},${H - padY} L${line.replace(/ /g, " L")} L${pts[pts.length - 1][0]},${H - padY} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bee-draw h-auto w-full" data-reveal={state} aria-hidden="true">
      <defs>
        <linearGradient id="bee-sales-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-green-1)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--color-green-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((k) => (
        <line key={k} x1={padX} x2={W - padX} y1={H - padY - k * (H - padY * 2)} y2={H - padY - k * (H - padY * 2)} stroke="color-mix(in srgb, var(--color-text) 7%, transparent)" />
      ))}
      <path d={area} fill="url(#bee-sales-fill)" className="bee-draw__area" />
      <polyline points={line} pathLength={1} fill="none" stroke="var(--color-green-1)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="bee-draw__line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={5} fill="var(--color-green-1)" stroke="var(--color-card)" strokeWidth={2} className="bee-draw__dot" style={{ transformOrigin: `${pts[pts.length - 1][0]}px ${pts[pts.length - 1][1]}px` }} />
    </svg>
  );
}

export function MarketingSalesProof() {
  const t = useTranslations("landing.sales");
  // One reveal for the whole chart card: the card rises in and, on the
  // same trigger, the chart draws itself — settleMs covers the 1.6 s draw.
  const { ref: chartRef, state: chartState } = useReveal<HTMLDivElement>({ threshold: 0.3, settleMs: 1900 });

  return (
    <section id="ventas" className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="bee-eyebrow bee-eyebrow--green">{t("eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("heading")}</h2>
          <p className="bee-caption mx-auto mt-3 max-w-xl text-sm">{t("subheading")}</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div ref={chartRef} data-reveal={chartState} className="bee-reveal bee-bento flex flex-col gap-4 p-5 lg:col-span-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{t("chart.title")}</p>
                <p className="bee-caption">{t("chart.caption")}</p>
              </div>
              <span className="rounded-full px-2 py-0.5 text-micro font-semibold text-[var(--color-text)]" style={{ background: "var(--color-green-3)" }}>
                {t("chart.badge")}
              </span>
            </div>
            <IllustrativeChart state={chartState} />
            <div className="grid grid-cols-3 gap-3">
              {(["month", "clients", "goal"] as const).map((k, i) => (
                <div key={k} className="rounded-[var(--radius-md)] p-3" style={{ background: ["var(--color-green-1)", "var(--color-green-2)", "var(--color-green-3)"][i] }}>
                  <p className="text-micro font-semibold uppercase tracking-wide text-[var(--color-text)]/80">{t(`chart.tiles.${k}.label`)}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-text)]">
                    <CountUp text={t(`chart.tiles.${k}.value`)} duration={1200 + i * 200} />
                  </p>
                </div>
              ))}
            </div>
            <p className="bee-micro">{t("chart.note")}</p>
          </div>

          <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            {REASONS.map((k, i) => (
              <div key={k} className="bee-bento flex gap-3 p-4" style={{ background: i % 2 === 0 ? "color-mix(in srgb, var(--color-green-3) 55%, var(--color-card))" : "var(--color-card)" }}>
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-text)]" style={{ background: "var(--color-green-1)" }}>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t(`reasons.${k}.title`)}</p>
                  <p className="bee-caption mt-1">{t(`reasons.${k}.description`)}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal className="bee-bento mt-4 overflow-hidden p-0">
          <div className="grid grid-cols-[1fr_1fr] border-b border-border text-micro font-semibold uppercase tracking-wide sm:grid-cols-[1.2fr_1fr_1fr]">
            <div className="hidden px-5 py-3 text-muted-foreground sm:block">{t("compare.dimension")}</div>
            <div className="px-5 py-3 text-muted-foreground">{t("compare.crm")}</div>
            <div className="px-5 py-3 text-[var(--color-text)]" style={{ background: "var(--color-green-3)" }}>{t("compare.bee")}</div>
          </div>
          {ROWS.map((row) => (
            <div key={row} className="grid grid-cols-[1fr_1fr] border-b border-border text-sm last:border-b-0 sm:grid-cols-[1.2fr_1fr_1fr]">
              <div className="hidden px-5 py-3 font-medium sm:block">{t(`compare.rows.${row}.dimension`)}</div>
              <div className="flex items-start gap-2 px-5 py-3 text-muted-foreground">
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
                <span>{t(`compare.rows.${row}.crm`)}</span>
              </div>
              <div className="flex items-start gap-2 px-5 py-3 font-medium" style={{ background: "color-mix(in srgb, var(--color-green-3) 40%, var(--color-card))" }}>
                <Check className="mt-0.5 size-4 shrink-0" style={{ color: "var(--color-green-1)" }} strokeWidth={3} />
                <span>{t(`compare.rows.${row}.bee`)}</span>
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-8 flex flex-wrap items-center justify-center gap-3" delay={120}>
          <Link href="/probar/sales" className="bee-btn text-sm font-semibold text-[var(--color-text)]" style={{ background: "var(--color-green-1)" }}>
            {t("cta")} <ArrowRight className="size-4" />
          </Link>
          <Link href="/register" className="bee-btn-ghost text-sm">
            {t("ctaSecondary")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
