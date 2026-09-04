"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, Field, Meter } from "@/features/brand/brand-primitives";
import { previewBrandVoice } from "@/lib/api";
import type { BrandVoicePreviewResult, VoiceProfile } from "@/lib/types";

/** Scale for the sentence-length meter — 40 words is already a very long
 *  sentence, so a 22-word cap reads as "about half way". */
const SENTENCE_SCALE = 40;

/** Row 1, left — who is writing and how it sounds. One hue: indigo. */
export function VoiceProfileBox({ profile }: { profile: VoiceProfile | null }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.voice");
  const tPanel = useTranslations("probarNetworkBrandControl.brand.panel");
  const hue = DATA.indigo;

  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      {!profile ? (
        <p className="bee-caption py-6 text-center">{tPanel("noProfile")}</p>
      ) : (
        <div className="bee-fill flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold" style={{ background: mix(hue, 24) }}>
              {profile.display_name[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.display_name}</p>
              <p className="bee-caption truncate">{profile.title ?? "CEO"}</p>
            </div>
          </div>

          {profile.bio_summary && <p className="bee-caption truncate" title={profile.bio_summary}>{profile.bio_summary}</p>}

          <Field label={t("toneLabel")} hint={t("toneHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.tone_descriptors.length > 0 ? (
                profile.tone_descriptors.map((d) => (
                  <Chip key={d} tone={hue}>
                    {d}
                  </Chip>
                ))
              ) : (
                <span className="bee-caption">—</span>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <Field label={t("sentenceLabel")}>
              <div className="mt-1.5 flex items-center gap-2">
                <Meter value={profile.max_sentence_words / SENTENCE_SCALE} tone={hue} className="flex-1" />
                <span className="shrink-0 text-xs font-bold tabular-nums">{t("sentenceValue", { count: profile.max_sentence_words })}</span>
              </div>
            </Field>
            <Field label={t("emojisLabel")}>
              <div className="mt-1">
                <Chip tone={hue} strength={profile.use_emojis ? 24 : 10} dot={false}>
                  {profile.use_emojis ? t("yes") : t("no")}
                </Chip>
              </div>
            </Field>
          </div>

          {profile.preferred_cta && (
            <Field label={t("ctaLabel")} hint={t("ctaHint")}>
              <p className="mt-1 rounded-[var(--radius-md)] px-3 py-2 text-sm italic" style={{ background: mix(hue, 10) }}>
                “{profile.preferred_cta}”
              </p>
            </Field>
          )}
        </div>
      )}
    </OverviewCard>
  );
}

/** Row 1, middle — the topics the voice owns and the phrases it never
 *  uses. One hue: honey (forbidden phrases wear it faded and struck). */
export function TopicsBox({ profile }: { profile: VoiceProfile | null }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.topics");
  const tPanel = useTranslations("probarNetworkBrandControl.brand.panel");
  const hue = DATA.honey;

  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      {!profile ? (
        <p className="bee-caption py-6 text-center">{tPanel("noProfile")}</p>
      ) : (
        <div className="bee-fill flex flex-col gap-4">
          <Field label={t("topicsLabel")} hint={t("topicsHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.authority_topics.length > 0 ? (
                profile.authority_topics.map((topic) => (
                  <Chip key={topic} tone={hue} strength={26}>
                    {topic}
                  </Chip>
                ))
              ) : (
                <span className="bee-caption">{t("topicsEmpty")}</span>
              )}
            </div>
          </Field>
          <Field label={t("forbiddenLabel")} hint={t("forbiddenHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.forbidden_phrases.length > 0 ? (
                profile.forbidden_phrases.map((phrase) => (
                  <Chip key={phrase} tone={hue} strength={10} muted>
                    {phrase}
                  </Chip>
                ))
              ) : (
                <span className="bee-caption">{t("forbiddenEmpty")}</span>
              )}
            </div>
          </Field>
        </div>
      )}
    </OverviewCard>
  );
}

/** Row 1, right — type a topic, see generic AI next to your voice. One hue: violet. */
export function PreviewBox({ profile }: { profile: VoiceProfile | null }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel.preview");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.preview");
  const hue = DATA.violet;
  const [topic, setTopic] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<BrandVoicePreviewResult | null>(null);

  async function handlePreview() {
    if (topic.trim().length < 3) return;
    setPreviewing(true);
    try {
      const result = await previewBrandVoice(topic);
      setPreview(result.data);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <OverviewCard span={4} title={t("title")} caption={tp("caption")}>
      <div className="bee-fill flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            id="brand-preview-topic"
            aria-label={t("topicPlaceholder")}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handlePreview();
            }}
            placeholder={t("topicPlaceholder")}
            className="bee-input min-w-0 flex-1"
            disabled={!profile}
          />
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={!profile || previewing || topic.trim().length < 3}
            className="bee-btn bee-btn--primary text-xs"
          >
            {previewing ? t("previewing") : t("button")}
          </button>
        </div>

        {!profile ? (
          <p className="bee-caption">{tp("needsProfile")}</p>
        ) : preview ? (
          <div className="flex flex-1 flex-col gap-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] p-3">
              <p className="bee-micro font-medium uppercase tracking-wide">{t("genericLabel")}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{preview.generic_version}</p>
            </div>
            <div className="rounded-[var(--radius-md)] p-3" style={{ background: mix(hue, 12), borderLeft: `3px solid ${hue}` }}>
              <p className="bee-micro font-medium uppercase tracking-wide">{t("brandedLabel")}</p>
              <p className="mt-1 text-sm">{preview.branded_version}</p>
            </div>
          </div>
        ) : null}
      </div>
    </OverviewCard>
  );
}
