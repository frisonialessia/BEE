"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DATA } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { LiveBadge } from "@/components/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AudienceMixBox, DISC_COLOR, DiscAdaptationBox, computeDiscMix } from "@/features/brand/disc-boxes";
import { ExtractVoiceBox } from "@/features/brand/extract-box";
import { FragmentLibraryBox } from "@/features/brand/fragment-library";
import { AnomalyMonitorBox, ChannelsBox, StyleLearningBox } from "@/features/brand/learning-boxes";
import { useBrandVoice } from "@/features/brand/use-brand-voice";
import { PreviewBox, TopicsBox, VoiceProfileBox } from "@/features/brand/voice-boxes";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";

/**
 * Voz de marca — what BEE knows about how you write, who you write to, and
 * the raw material it learns from.
 *
 * Same shell as Ventas and Prioridad: a stat strip with the four headline
 * numbers, then the 12-column .bee-overview grid where every box is an
 * OverviewCard and wears ONE hue at different strengths —
 *   row 1  your voice (indigo) · topics & forbidden phrases (honey) · preview (violet)
 *   row 2  audience mix by DISC style (categorical series) · how BEE adapts (the chosen style's color)
 *   row 3  fragment library (honey) · paste-and-extract (indigo)
 *   row 4  style learning (violet) · anomaly monitor (magenta) · channels (lavender)
 * Every technical term (tono, DISC, fragmento…) gets its one-line caption
 * where it is drawn. No greens on this page — those belong to Ventas.
 */
export function BrandView() {
  const tNav = useTranslations("nav.items");
  const t = useTranslations("probarNetworkBrandControl.brand");
  const ts = useTranslations("probarNetworkBrandControl.brand.page.stats");
  const tDisc = useTranslations("probarNetworkBrandControl.brand.page.disc");

  const voice = useBrandVoice();
  const { data: leadsResult } = useLeads(300);
  const { data: companiesResult } = useCompanies(300);
  const discMix = useMemo(() => computeDiscMix(leadsResult?.data ?? [], companiesResult?.data ?? []), [leadsResult, companiesResult]);

  const { profile, fragments, styleProfile } = voice;
  const scored = fragments.filter((f) => f.performance_score != null);
  const avgPerformance = scored.length > 0 ? scored.reduce((sum, f) => sum + (f.performance_score ?? 0), 0) / scored.length : null;
  const usedTotal = fragments.reduce((sum, f) => sum + f.used_count, 0);
  const topPct = discMix.top ? Math.round((discMix.counts[discMix.top] / discMix.total) * 100) : 0;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="bee-eyebrow">{t("eyebrow")}</p>
          <h1 className="bee-display mt-1">{tNav("brand")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </div>
        <LiveBadge live={voice.live} />
      </header>

      {voice.loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="space-y-4">
          <StatStrip cols={4}>
            <StatTile label={ts("fragments")} value={fragments.length} hint={ts("fragmentsHint", { count: usedTotal })} tone={DATA.honey} />
            <StatTile
              label={ts("performance")}
              value={avgPerformance === null ? "—" : `${Math.round(avgPerformance * 100)}%`}
              hint={avgPerformance === null ? ts("performanceNone") : ts("performanceHint", { count: scored.length })}
              progress={avgPerformance ?? undefined}
              tone={DATA.indigo}
            />
            <StatTile
              label={ts("corrections")}
              value={styleProfile?.total_corrections ?? 0}
              hint={
                styleProfile && styleProfile.total_corrections > 0
                  ? ts("correctionsHint", { version: styleProfile.profile_version, count: styleProfile.authoritative_rules_count })
                  : ts("correctionsNone")
              }
              tone={DATA.violet}
            />
            <StatTile
              label={ts("audience")}
              value={discMix.top ? tDisc(`styles.${discMix.top}.name`) : "—"}
              hint={discMix.top ? ts("audienceHint", { letter: discMix.top, pct: topPct }) : ts("audienceNone")}
              tone={discMix.top ? DISC_COLOR[discMix.top] : DATA.magenta}
            />
          </StatStrip>

          <div className="bee-overview">
            <VoiceProfileBox profile={profile} />
            <TopicsBox profile={profile} />
            <PreviewBox profile={profile} />

            <AudienceMixBox mix={discMix} />
            <DiscAdaptationBox mix={discMix} />

            <FragmentLibraryBox profile={profile} fragments={fragments} onChanged={voice.refreshFragments} />
            <ExtractVoiceBox
              profile={profile}
              onSaved={(saved) => {
                voice.setProfile(saved);
                void voice.refreshFragments(saved.id);
              }}
            />

            <StyleLearningBox styleProfile={styleProfile} onProfile={voice.setStyleProfile} />
            <AnomalyMonitorBox />
            <ChannelsBox channels={voice.channels} />
          </div>
        </div>
      )}
    </div>
  );
}
