"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";
import { Field } from "@/features/crm/drawer/primitives";
import { createBrandProfile, extractVoiceProfile } from "@/lib/api";
import type { VoiceProfile } from "@/lib/types";

const MIN_PASTE_CHARS = 40;

function csv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * The one place a voice profile is created or replaced, in the same
 * language as every BEE form: paste your own writing and BEE proposes
 * tone / topics / CTA / forbidden phrases / bio into the fields below, or
 * fill them by hand, then save. Creating always replaces the active
 * profile (the API has no PATCH), which is why the caption says so when
 * one exists.
 */
export function ExtractVoiceBox({ profile, onSaved }: { profile: VoiceProfile | null; onSaved: (profile: VoiceProfile) => void }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel.createForm");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.extract");

  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedBy, setExtractedBy] = useState<"llm" | "heuristic" | "demo" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Prefilled from the active profile when there is one (so "replace" edits
  // what you have), otherwise the seeded example values — a plausible
  // starting point to edit rather than a blank field.
  const [name, setName] = useState(profile?.display_name ?? "");
  const [title, setTitle] = useState(profile?.title ?? "");
  const [tone, setTone] = useState(profile ? csv(profile.tone_descriptors) : t("defaultTone"));
  const [topics, setTopics] = useState(profile ? csv(profile.authority_topics) : t("defaultTopics"));
  const [cta, setCta] = useState(profile?.preferred_cta ?? t("defaultCTA"));
  const [forbidden, setForbidden] = useState(profile ? csv(profile.forbidden_phrases) : "");
  const [bio, setBio] = useState(profile?.bio_summary ?? "");

  function resetToProfile() {
    setName(profile?.display_name ?? "");
    setTitle(profile?.title ?? "");
    setTone(profile ? csv(profile.tone_descriptors) : t("defaultTone"));
    setTopics(profile ? csv(profile.authority_topics) : t("defaultTopics"));
    setCta(profile?.preferred_cta ?? t("defaultCTA"));
    setForbidden(profile ? csv(profile.forbidden_phrases) : "");
    setBio(profile?.bio_summary ?? "");
    setPasteText("");
    setExtractedBy(null);
  }

  async function handleExtract() {
    if (pasteText.trim().length < MIN_PASTE_CHARS) return;
    setExtracting(true);
    try {
      const draft = (await extractVoiceProfile(pasteText)).data;
      if (draft.tone_descriptors.length > 0) setTone(csv(draft.tone_descriptors));
      if (draft.authority_topics.length > 0) setTopics(csv(draft.authority_topics));
      if (draft.forbidden_phrases.length > 0) setForbidden(csv(draft.forbidden_phrases));
      if (draft.preferred_cta) setCta(draft.preferred_cta);
      if (draft.bio_summary) setBio(draft.bio_summary);
      if (draft.title && !title) setTitle(draft.title);
      setExtractedBy(draft.generated_by);
      setSaved(false);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await createBrandProfile({
        display_name: name.trim(),
        title: title.trim() || undefined,
        tone_descriptors: fromCsv(tone),
        authority_topics: fromCsv(topics),
        forbidden_phrases: fromCsv(forbidden),
        preferred_cta: cta.trim() || undefined,
        bio_summary: bio.trim() || undefined,
      });
      onSaved(result.data);
      setSaved(true);
      setPasteText("");
      setExtractedBy(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OverviewCard span={7} title={tp("title")} caption={profile ? tp("captionReplace") : tp("caption")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="bee-fill flex flex-col gap-3"
      >
        <Field label={tp("pasteLabel")} hint={extractedBy ? (extractedBy === "llm" ? t("extractedByLlm") : t("extractedByHeuristic")) : tp("pasteHint")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea id="brand-paste-text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={t("pastePlaceholder")} rows={3} className="bee-input min-w-0 flex-1" />
            <button type="button" onClick={() => void handleExtract()} disabled={extracting || pasteText.trim().length < MIN_PASTE_CHARS} className="bee-btn-ghost shrink-0">
              {extracting ? t("extracting") : t("extractButton")}
            </button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("nameLabel")} required>
            <input id="brand-create-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="bee-input" required />
          </Field>
          <Field label={tp("titleLabel")}>
            <input id="brand-create-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tp("titlePlaceholder")} className="bee-input" />
          </Field>
          <Field label={t("toneLabel")}>
            <input id="brand-create-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("tonePlaceholder")} className="bee-input" />
          </Field>
          <Field label={t("topicsLabel")}>
            <input id="brand-create-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={t("topicsPlaceholder")} className="bee-input" />
          </Field>
          <Field label={t("ctaLabel")}>
            <input id="brand-create-cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder={t("ctaPlaceholder")} className="bee-input" />
          </Field>
          <Field label={tp("forbiddenLabel")}>
            <input id="brand-create-forbidden" value={forbidden} onChange={(e) => setForbidden(e.target.value)} placeholder={tp("forbiddenPlaceholder")} className="bee-input" />
          </Field>
          <Field label={t("bioLabel")} className="sm:col-span-2">
            <textarea id="brand-create-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("bioPlaceholder")} rows={2} className="bee-input" />
          </Field>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="bee-micro">{saved ? tp("savedNote") : tp("replaceNote")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={resetToProfile} className="bee-btn-ghost">
              {t("cancel")}
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="bee-btn bee-btn--primary">
              {saving ? t("saving") : profile ? tp("saveReplace") : t("submit")}
            </button>
          </div>
        </div>
      </form>
    </OverviewCard>
  );
}
