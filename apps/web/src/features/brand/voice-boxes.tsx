"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, Field, Meter } from "@/features/brand/brand-primitives";
import { EmptyLine } from "@/features/control/components/primitives";
import { previewBrandVoice } from "@/lib/api";
import type { BrandVoicePreviewResult, VoiceProfile } from "@/lib/types";

/** Scale for the sentence-length meter — 40 words is already a very long
 *  sentence, so a 22-word cap reads as "about half way". */
const SENTENCE_SCALE = 40;

const HUE = TONE.urgency;

/** Row 2 — who is writing and how it sounds: tone, sentence length,
 *  emojis, the usual close, the topics it owns and the phrases it never
 *  uses. One hue, magenta, at 45 % on every chip. */
export function VoiceProfileBox({ profile }: { profile: VoiceProfile | null }) {
  const t = useTranslations("probarNetworkBrandControl.brand.page.voice");
  const tTopics = useTranslations("probarNetworkBrandControl.brand.page.topics");
  const tPanel = useTranslations("probarNetworkBrandControl.brand.panel");

  return (
    <OverviewCard span={4} title={t("title")} caption={t("caption")}>
      {!profile ? (
        <EmptyLine>{tPanel("noProfile")}</EmptyLine>
      ) : (
        <div className="bee-fill flex flex-col gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile.display_name}</p>
            <p className="bee-caption truncate">{profile.title ?? "CEO"}</p>
            {profile.bio_summary && (
              <p className="bee-caption mt-1 line-clamp-2" title={profile.bio_summary}>
                {profile.bio_summary}
              </p>
            )}
          </div>

          <Field label={t("toneLabel")} hint={t("toneHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.tone_descriptors.length > 0 ? (
                profile.tone_descriptors.map((d) => (
                  <Chip key={d} tone={HUE} strength={45}>
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
                <Meter value={profile.max_sentence_words / SENTENCE_SCALE} tone={HUE} className="flex-1" />
                <span className="shrink-0 bee-caption tabular-nums">{t("sentenceValue", { count: profile.max_sentence_words })}</span>
              </div>
            </Field>
            <Field label={t("emojisLabel")}>
              <div className="mt-1">
                <Chip tone={HUE} strength={profile.use_emojis ? 45 : 0} dot={false}>
                  {profile.use_emojis ? t("yes") : t("no")}
                </Chip>
              </div>
            </Field>
          </div>

          {profile.preferred_cta && (
            <Field label={t("ctaLabel")} hint={t("ctaHint")}>
              <p className="mt-1 rounded-[var(--radius-md)] px-3 py-2 text-sm italic" style={{ background: REST }}>
                “{profile.preferred_cta}”
              </p>
            </Field>
          )}

          <Field label={tTopics("topicsLabel")} hint={tTopics("topicsHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.authority_topics.length > 0 ? (
                profile.authority_topics.map((topic) => (
                  <Chip key={topic} tone={HUE} strength={45}>
                    {topic}
                  </Chip>
                ))
              ) : (
                <span className="bee-caption">{tTopics("topicsEmpty")}</span>
              )}
            </div>
          </Field>
          <Field label={tTopics("forbiddenLabel")} hint={tTopics("forbiddenHint")}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.forbidden_phrases.length > 0 ? (
                profile.forbidden_phrases.map((phrase) => (
                  <Chip key={phrase} tone={HUE} strength={0} muted>
                    {phrase}
                  </Chip>
                ))
              ) : (
                <span className="bee-caption">{tTopics("forbiddenEmpty")}</span>
              )}
            </div>
          </Field>
        </div>
      )}
    </OverviewCard>
  );
}

/** Plantillas — type a topic, see generic AI next to your voice. */
export function PreviewBox({ profile }: { profile: VoiceProfile | null }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel.preview");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.preview");
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
        <label className="flex min-w-0 flex-col gap-1">
          <span className="bee-caption">{tp("topicLabel")}</span>
          <input
            id="brand-preview-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handlePreview();
            }}
            placeholder={t("topicPlaceholder")}
            className="bee-input"
            disabled={!profile}
          />
        </label>

        {!profile ? (
          <p className="bee-caption">{tp("needsProfile")}</p>
        ) : preview ? (
          <div className="flex flex-1 flex-col gap-2">
            <div className="rounded-[var(--radius-md)] p-3" style={{ background: REST }}>
              <p className="bee-caption">{t("genericLabel")}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{preview.generic_version}</p>
            </div>
            <div className="rounded-[var(--radius-md)] p-3" style={{ background: tint(HUE, 45) }}>
              <p className="bee-caption">{t("brandedLabel")}</p>
              <p className="mt-1 text-sm">{preview.branded_version}</p>
            </div>
          </div>
        ) : (
          <p className="bee-micro">{tp("hint")}</p>
        )}

        <div className="mt-auto flex justify-end pt-1">
          <button type="button" onClick={() => void handlePreview()} disabled={!profile || previewing || topic.trim().length < 3} className="bee-btn bee-btn--primary">
            {previewing ? t("previewing") : t("button")}
          </button>
        </div>
      </div>
    </OverviewCard>
  );
}
