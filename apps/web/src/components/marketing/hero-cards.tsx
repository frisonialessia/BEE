import { getTranslations } from "next-intl/server";

import { Honeycomb } from "@/components/charts/honeycomb";
import { TONE, tint } from "@/components/charts/palette";
import type { Locale } from "@/i18n/locales";
import { getSampleHotLeads, getSampleSignals } from "@/lib/sample-data";

/**
 * The hero's fan of cards — four real fragments of the product, not stock
 * photos or invented numbers: the same hot lead, the same signal count and
 * the same hive the visitor meets a scroll below in `LandingDemo`. Desktop
 * only (`lg:` and up — the margins a `max-w-3xl` hero has to spare at that
 * width); on a phone the hero stays the plain, focused version it always
 * was. Decorative and duplicated by the accessible copy right after, so
 * the whole layer is `aria-hidden`.
 */
export async function HeroCards({ locale }: { locale: Locale }) {
  const t = await getTranslations("landing.hero.cards");
  const tDemo = await getTranslations("landing.demo");
  const tHive = await getTranslations("shared.intentHive");

  const leads = getSampleHotLeads(locale);
  const signals = getSampleSignals(locale);
  const lead = leads.find((l) => l.id === "h1") ?? leads[0];
  const hot = signals.filter((s) => s.score >= 75).length;
  const latest = [...signals].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())[0];
  const hiveItems = leads.slice(0, 12).map((l) => ({ id: l.id, heat: l.research_intensity_score, label: l.company_name ?? l.company_domain }));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {/* Lead — top-left: the same hot account the hive below lights up. */}
      <div
        className="bee-hero-float absolute left-[-6.5rem] top-2 w-44 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-[var(--bee-shadow-card-lift)]"
        style={{ "--bee-float-rot": "-6deg", "--bee-float-i": 0 } as React.CSSProperties}
      >
        <p className="bee-micro">{t("lead.eyebrow")}</p>
        <p className="mt-1 truncate text-sm font-semibold">{lead?.company_name ?? lead?.company_domain}</p>
        {lead && (
          <>
            <div className="mt-2 flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: TONE.market }} />
              <span className="bee-micro min-w-0 flex-1 truncate">{tHive("stages.ready_to_buy")}</span>
            </div>
            <p className="bee-micro mt-0.5 pl-3.5">{tHive("score", { score: Math.round(lead.research_intensity_score) })}</p>
          </>
        )}
      </div>

      {/* Stat — top-right: the same "Alta intención" tile from the demo. */}
      <div
        className="bee-hero-float absolute right-[-7rem] top-0 w-40 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-[var(--bee-shadow-card-lift)]"
        style={{ "--bee-float-rot": "5deg", "--bee-float-i": 1 } as React.CSSProperties}
      >
        <span className="bee-tile__chip" style={{ background: tint(TONE.urgency, 45) }}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: TONE.urgency }} />
          <span className="truncate">{tDemo("kpis.hot")}</span>
        </span>
        <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{hot}</p>
        <p className="bee-caption mt-1 truncate">{tDemo("kpis.hotHint")}</p>
      </div>

      {/* Play — bottom-left: the latest real sample signal, as a play. */}
      <div
        className="bee-hero-float absolute bottom-16 left-[-7rem] w-48 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-[var(--bee-shadow-card-lift)]"
        style={{ "--bee-float-rot": "-3deg", "--bee-float-i": 2 } as React.CSSProperties}
      >
        <p className="bee-micro">{t("play.eyebrow")}</p>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">{latest?.title}</p>
        <div className="mt-2.5 flex gap-1">
          {[1, 2, 3].map((i) => (
            <i key={i} className="h-1 flex-1 rounded-full" style={{ background: i < 3 ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }} />
          ))}
        </div>
      </div>

      {/* Hive — bottom-right: a small real comb, BEE's own identity mark. */}
      <div
        className="bee-hero-float absolute bottom-[-2.5rem] right-[-5rem] w-32 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-2.5 shadow-[var(--bee-shadow-card-lift)]"
        style={{ "--bee-float-rot": "4deg", "--bee-float-i": 3 } as React.CSSProperties}
      >
        <Honeycomb items={hiveItems} maxRadius={10} minHeight={88} ariaLabel="" />
      </div>
    </div>
  );
}
