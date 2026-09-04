"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { FormLabel } from "@/features/brand/brand-primitives";
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
 * Row 3, right — the one place a voice profile is created or replaced:
 * paste your own writing, BEE proposes tone / topics / CTA / forbidden
 * phrases / bio, you review the fields and save. "Fill by hand" opens the
 * same fields without the extraction step. Creating always replaces the
 * active profile (the API has no PATCH), which is why the caption says so
 * when one exists. One hue: indigo.
 */
export function ExtractVoiceBox({ profile, onSaved }: { profile: VoiceProfile | null; onSaved: (profile: VoiceProfile) => void }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel.createForm");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.extract");
  const hue = DATA.indigo;

  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedBy, setExtractedBy] = useState<"llm" | "heuristic" | "demo" | null>(null);
  const [showFields, setShowFields] = useState(false);
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

  const step = saved && !showFields ? 3 : showFields ? 2 : 1;

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
      setShowFields(true);
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
      setShowFields(false);
      setSaved(true);
      setPasteText("");
      setExtractedBy(null);
    } finally {
      setSaving(false);
    }
  }

  const steps = [tp("steps.paste"), tp("steps.review"), tp("steps.save")];

  return (
    <OverviewCard span={5} title={tp("title")} caption={profile ? tp("captionReplace") : tp("caption")}>
      <div className="bee-fill flex flex-col gap-3">
        <ol className="grid grid-cols-3 gap-2">
          {steps.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            return (
              <li key={label} className="rounded-[var(--radius-md)] px-3 py-1.5" style={{ background: mix(hue, active ? 24 : 8) }} aria-current={active ? "step" : undefined}>
                <p className={`text-xs ${active ? "font-bold" : "font-medium text-[var(--color-text-muted)]"}`}>
                  <span className="tabular-nums">{n}</span> · {label}
                </p>
              </li>
            );
          })}
        </ol>

        <textarea
          id="brand-paste-text"
          aria-label={t("pastePlaceholder")}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={t("pastePlaceholder")}
          rows={5}
          className="bee-input"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExtract()}
            disabled={extracting || pasteText.trim().length < MIN_PASTE_CHARS}
            className="bee-btn bee-btn--primary text-xs"
          >
            {extracting ? t("extracting") : t("extractButton")}
          </button>
          <button type="button" onClick={() => setShowFields((v) => !v)} className="bee-btn-text text-xs">
            {showFields ? tp("hideFields") : t("modeManual")}
          </button>
          {extractedBy && (
            <span className="bee-micro">{extractedBy === "llm" ? t("extractedByLlm") : t("extractedByHeuristic")}</span>
          )}
        </div>

        {showFields && (
          <div className="space-y-3 rounded-[var(--radius-md)] p-3" style={{ background: mix(hue, 8) }}>
            <p className="text-sm font-semibold">{extractedBy ? tp("proposedTitle") : tp("manualTitle")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FormLabel htmlFor="brand-create-name">{t("nameLabel")}</FormLabel>
                <input id="brand-create-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="bee-input" />
              </div>
              <div>
                <FormLabel htmlFor="brand-create-title">{tp("titleLabel")}</FormLabel>
                <input id="brand-create-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tp("titlePlaceholder")} className="bee-input" />
              </div>
              <div>
                <FormLabel htmlFor="brand-create-tone">{t("toneLabel")}</FormLabel>
                <input id="brand-create-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("tonePlaceholder")} className="bee-input" />
              </div>
              <div>
                <FormLabel htmlFor="brand-create-topics">{t("topicsLabel")}</FormLabel>
                <input id="brand-create-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={t("topicsPlaceholder")} className="bee-input" />
              </div>
              <div>
                <FormLabel htmlFor="brand-create-cta">{t("ctaLabel")}</FormLabel>
                <input id="brand-create-cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder={t("ctaPlaceholder")} className="bee-input" />
              </div>
              <div>
                <FormLabel htmlFor="brand-create-forbidden">{tp("forbiddenLabel")}</FormLabel>
                <input id="brand-create-forbidden" value={forbidden} onChange={(e) => setForbidden(e.target.value)} placeholder={tp("forbiddenPlaceholder")} className="bee-input" />
              </div>
              <div className="sm:col-span-2">
                <FormLabel htmlFor="brand-create-bio">{t("bioLabel")}</FormLabel>
                <textarea id="brand-create-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("bioPlaceholder")} rows={2} className="bee-input" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleSave()} disabled={saving || !name.trim()} className="bee-btn bee-btn--primary text-xs">
                {saving ? t("saving") : profile ? tp("saveReplace") : t("submit")}
              </button>
              <button type="button" onClick={() => setShowFields(false)} className="bee-btn text-xs">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {saved && !showFields && <p className="bee-micro">{tp("savedNote")}</p>}
      </div>
    </OverviewCard>
  );
}
