"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Honeycomb } from "@/components/charts/honeycomb";
import type { Locale } from "@/i18n/locales";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";

const DAY_MS = 86_400_000;

/**
 * The hero's one piece of product: a real, legible panel — the hive plus
 * the same two counts LandingDemo shows a scroll below — with two small
 * badges anchored to its corners, not a fan of cards scattered across the
 * hero. Everything reads at a glance and nothing is truncated, so unlike
 * a card fan this needs no `lg:`-only cutoff: the badges sit close enough
 * to the panel to hold up at phone width too. All three pieces read the
 * same sample data LandingDemo uses — nothing invented, nothing that
 * diverges from what the visitor meets a scroll below. Client component
 * (like LandingDemo) so "now" is a stable, lazily-read timestamp instead
 * of an impure call during render.
 */
export function HeroPanel({ locale }: { locale: Locale }) {
  const t = useTranslations("landing.hero.cards");
  const tDemo = useTranslations("landing.demo");
  const tHive = useTranslations("shared.intentHive");
  const [now] = useState(() => Date.now());

  const leads = getSampleHotLeads(locale);
  const signals = getSampleSignals(locale);
  const recent = signals.filter((s) => now - new Date(s.detected_at).getTime() <= 30 * DAY_MS).length;
  const hot = signals.filter((s) => s.score >= 75).length;
  const lead = leads.find((l) => l.id === "h1") ?? leads[0];
  const hiveItems = leads.slice(0, 19).map((l) => ({ id: l.id, heat: l.research_intensity_score, label: l.company_name ?? l.company_domain }));

  return (
    <div className="relative mx-auto mt-10 w-full max-w-sm">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left shadow-[var(--bee-shadow-card-lift)]">
        <p className="bee-caption">{tDemo("hiveTitle")}</p>
        <div className="mt-2 flex items-center justify-center">
          <Honeycomb items={hiveItems} maxRadius={13} minHeight={120} ariaLabel={tHive("aria", { count: hiveItems.length })} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--color-divider)] pt-3">
          <div>
            <p className="bee-micro">{tDemo("kpis.signals")}</p>
            <p className="text-xl font-bold tabular-nums">{recent}</p>
          </div>
          <div>
            <p className="bee-micro">{tDemo("kpis.hot")}</p>
            <p className="text-xl font-bold tabular-nums">{hot}</p>
          </div>
        </div>
      </div>

      {/* Lead — top-right corner, a slight tilt, never truncated. */}
      {lead && (
        <div className="absolute -right-4 -top-5 w-40 rotate-[3deg] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2.5 shadow-[var(--bee-shadow-card-lift)] sm:-right-5 sm:w-44">
          <p className="bee-micro">{t("lead.eyebrow")}</p>
          <p className="mt-0.5 truncate text-xs font-semibold">
            {lead.company_name ?? lead.company_domain} · {Math.round(lead.research_intensity_score)}
          </p>
        </div>
      )}

      {/* Play — bottom-left corner: the same 3-segment progress the CRM
          board and the "Cómo funciona" step below use for "a play ready". */}
      <div className="absolute -bottom-5 -left-4 w-36 rotate-[-2deg] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2.5 shadow-[var(--bee-shadow-card-lift)] sm:-left-5 sm:w-40">
        <p className="bee-micro">{t("play.eyebrow")}</p>
        <p className="mt-1 flex gap-1" aria-hidden>
          {[1, 2, 3].map((i) => (
            <i key={i} className="h-1 flex-1 rounded-full" style={{ background: i < 3 ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
          ))}
        </p>
      </div>
    </div>
  );
}
