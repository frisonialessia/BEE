"use client";

import { Check, Lock, Radio, ShieldCheck, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Donut } from "@/components/charts/donut";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, mix } from "@/components/charts/palette";
import { ProgressRing } from "@/components/charts/progress-ring";
import { useReveal } from "@/components/marketing-motion";
import { Sparkline } from "@/components/sparkline";

/**
 * MarketingTrustCards — "Por qué confiar en BEE" as four cards, one per
 * architectural guarantee, each carrying a small chart of the exact kind
 * the dashboard draws (the same components from src/components/charts, so
 * a visitor who signs up recognises the marks):
 *
 *   Cero alucinaciones   → ProgressRing at 100 % — scores with real data.
 *   Aprobación humana    → HorizontalFunnel: prepared 12 · approved 9 · sent 9
 *                          (nothing sends that was not approved: the last
 *                          two bars are equal by construction).
 *   Multi-tenant real    → Donut with one slice — "your organization 100 %":
 *                          a whole with nothing else in it, i.e. isolation.
 *   Seguro desde el diseño → a flat Sparkline at zero with a check — 0
 *                          incidents on the line.
 *
 * One hue per card (indigo · honey · lilac · magenta), title + ONE short
 * caption. Figures are illustrative demo values and the section footnote
 * says so. Charts get a fixed 120px box (they size themselves to it via
 * useBoxSize / fixed size props). Entry: the cards rise with the standard
 * Reveal stagger and the marks play once — the ring and donut arcs fill,
 * the bars grow, the line draws — driven by the same data-reveal state
 * (see .bee-trust in globals.css). Server render = the finished charts.
 */

const CARDS = [
  { id: "noHallucinations", icon: ShieldCheck, hue: DATA.indigo },
  { id: "humanApproval", icon: UserCheck, hue: DATA.honey },
  { id: "multiTenant", icon: Lock, hue: DATA.violet },
  { id: "secureByDesign", icon: Radio, hue: DATA.magenta },
] as const;

type CardId = (typeof CARDS)[number]["id"];

// Illustrative demo figures for the approval funnel — labelled as demo in
// the section footnote (marketing.landing.trustNote).
const FUNNEL = { prepared: 12, approved: 9, sent: 9 } as const;
const FLAT_LINE = [0, 0, 0, 0, 0, 0, 0, 0];

function Chart({ id, hue }: { id: CardId; hue: string }) {
  const t = useTranslations("marketing.landing.trustCharts");
  switch (id) {
    case "noHallucinations":
      return (
        <div className="bee-trust-ring flex h-full items-center gap-4">
          <ProgressRing value={1} size={96} stroke={8} color={hue} label={`100% ${t("ringLabel")}`} />
          <p className="bee-caption min-w-0 text-xs leading-snug">{t("ringLabel")}</p>
        </div>
      );
    case "humanApproval":
      return (
        <div className="bee-trust-funnel flex h-full flex-col justify-center">
          <HorizontalFunnel
            rows={[
              { label: t("funnel.prepared"), value: FUNNEL.prepared, color: hue },
              { label: t("funnel.approved"), value: FUNNEL.approved, color: hue },
              { label: t("funnel.sent"), value: FUNNEL.sent, color: hue },
            ]}
          />
        </div>
      );
    case "multiTenant":
      return (
        <div className="bee-trust-donut h-full">
          <Donut slices={[{ label: t("donutSlice"), value: 100, color: hue }]} size={96} centerLabel="100%" />
        </div>
      );
    case "secureByDesign":
      return (
        <div className="bee-trust-spark flex h-full flex-col justify-center gap-3" style={{ color: hue }}>
          <Sparkline values={FLAT_LINE} width={240} height={56} className="h-auto w-full" />
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Check className="size-4 shrink-0" strokeWidth={2.5} style={{ color: hue }} />
            {t("sparkLabel")}
          </p>
        </div>
      );
  }
}

export function MarketingTrustCards() {
  const t = useTranslations("marketing.landing");
  const { ref, state } = useReveal<HTMLDivElement>({ threshold: 0.2, settleMs: 1900 });

  return (
    <div ref={ref} data-reveal={state} className="bee-reveal bee-reveal--stagger bee-trust grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((card) => (
        <div key={card.id} className="bee-bento bee-bento-pad flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: mix(card.hue, 20), color: `color-mix(in srgb, ${card.hue} 70%, var(--color-text) 30%)` }}
            >
              <card.icon className="size-4 stroke-[1.5]" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight">{t(`guarantees.${card.id}.title`)}</h3>
          </div>
          {/* Fixed chart box — the charts fill it; equal across the row. */}
          <div className="h-[120px]">
            <Chart id={card.id} hue={card.hue} />
          </div>
          <p className="bee-caption mt-auto">{t(`guarantees.${card.id}.description`)}</p>
        </div>
      ))}
    </div>
  );
}
