"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { TONE } from "@/components/charts/palette";
import { StatStrip, StatTile } from "@/components/charts/stat-tile";
import { LiveBadge } from "@/components/live-badge";
import { MergedPageTabs } from "@/components/merged-page-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AudienceMixBox, AudienceRadarBox, DiscAdaptationBox, computeDiscMix } from "@/features/brand/disc-boxes";
import { ExtractVoiceBox } from "@/features/brand/extract-box";
import { FragmentTemplateCards } from "@/features/brand/fragment-library";
import { ChannelsBox, StyleLearningBox } from "@/features/brand/learning-boxes";
import { useBrandVoice } from "@/features/brand/use-brand-voice";
import { PreviewBox, VoiceProfileBox } from "@/features/brand/voice-boxes";
import { useCompanies } from "@/hooks/queries/use-companies";
import { useLeads } from "@/hooks/queries/use-leads";

/**
 * Voz de marca — what BEE knows about how you write, who you write to, and
 * the raw material it learns from. Two tabs under one header:
 *   Perfil     · the audience's DISC shape (radar) and its split (bars),
 *                how BEE adapts, how your voice sounds, the channels, the
 *                profile form and the style-learning form;
 *   Plantillas · the fragment library as white cards with a preview, the
 *                add/edit form, and the generic-vs-your-voice preview.
 * The strip carries four real numbers. The page wears magenta: it is
 * about adapting to a person. The conversion-anomaly monitor lives on
 * Control › Salud now (same alerts, one place).
 */
export function BrandView() {
  const tNav = useTranslations("nav.items");
  const t = useTranslations("probarNetworkBrandControl.brand");
  const ts = useTranslations("probarNetworkBrandControl.brand.page.stats");

  const voice = useBrandVoice();
  const { data: leadsResult } = useLeads(300);
  const { data: companiesResult } = useCompanies(300);
  const discMix = useMemo(() => computeDiscMix(leadsResult?.data ?? [], companiesResult?.data ?? []), [leadsResult, companiesResult]);

  const { profile, fragments, styleProfile } = voice;
  const scored = fragments.filter((f) => f.performance_score != null);
  const avgPerformance = scored.length > 0 ? scored.reduce((sum, f) => sum + (f.performance_score ?? 0), 0) / scored.length : null;
  const usedTotal = fragments.reduce((sum, f) => sum + f.used_count, 0);
  const templates = fragments.filter((f) => f.category === "response_template").length;

  const header = (
    <header className="min-w-0">
      <p className="bee-eyebrow">{t("eyebrow")}</p>
      <h1 className="bee-display mt-1 truncate">{tNav("brand")}</h1>
      <p className="bee-caption mt-1 line-clamp-2">{t("caption")}</p>
    </header>
  );

  const strip = voice.loading ? (
    <div className="bee-strip grid grid-cols-2 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
      ))}
    </div>
  ) : (
    <StatStrip cols={4}>
      <StatTile label={ts("fragments")} value={fragments.length} hint={ts("fragmentsHint", { count: usedTotal })} tone={TONE.market} />
      <StatTile
        label={ts("performance")}
        value={avgPerformance === null ? "—" : `${Math.round(avgPerformance * 100)}%`}
        hint={avgPerformance === null ? ts("performanceNone") : ts("performanceHint", { count: scored.length })}
        progress={avgPerformance ?? undefined}
        tone={TONE.forecast}
      />
      <StatTile label={ts("templates")} value={templates} hint={ts("templatesHint", { count: fragments.length })} tone={TONE.prepared} />
      <StatTile
        label={ts("corrections")}
        value={styleProfile?.total_corrections ?? 0}
        hint={styleProfile && styleProfile.total_corrections > 0 ? ts("correctionsHint", { version: styleProfile.profile_version, count: styleProfile.authoritative_rules_count }) : ts("correctionsNone")}
        tone={TONE.urgency}
      />
    </StatStrip>
  );

  const loadingBoard = (
    <div className="bee-overview">
      <Skeleton className="rounded-[var(--radius-lg)]" style={{ gridColumn: "span 5" }} />
      <Skeleton className="rounded-[var(--radius-lg)]" style={{ gridColumn: "span 7" }} />
    </div>
  );

  return (
    <MergedPageTabs
      header={header}
      actions={<LiveBadge live={voice.live} />}
      defaultValue="profile"
      belowTabs={strip}
      tabs={[
        {
          value: "profile",
          label: t("tabs.profile"),
          content: voice.loading ? (
            loadingBoard
          ) : (
            <div className="bee-overview">
              <AudienceRadarBox mix={discMix} />
              <AudienceMixBox mix={discMix} />

              <DiscAdaptationBox mix={discMix} />
              <VoiceProfileBox profile={profile} />
              <ChannelsBox channels={voice.channels} />

              <ExtractVoiceBox
                key={profile?.id ?? "new"}
                profile={profile}
                onSaved={(saved) => {
                  voice.setProfile(saved);
                  void voice.refreshFragments(saved.id);
                }}
              />
              <StyleLearningBox styleProfile={styleProfile} onProfile={voice.setStyleProfile} />
            </div>
          ),
        },
        {
          value: "templates",
          label: t("tabs.templates"),
          content: voice.loading ? (
            loadingBoard
          ) : (
            <div className="bee-overview">
              <PreviewBox profile={profile} />
              <FragmentTemplateCards profile={profile} fragments={fragments} onChanged={voice.refreshFragments} />
            </div>
          ),
        },
      ]}
    />
  );
}
