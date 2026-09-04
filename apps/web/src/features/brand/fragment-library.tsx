"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { REST, TONE, tint } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, Meter } from "@/features/brand/brand-primitives";
import { EmptyLine } from "@/features/control/components/primitives";
import { Field, Pill } from "@/features/crm/drawer/primitives";
import { addBrandFragment, deleteBrandFragment } from "@/lib/api";
import type { BrandFragment, VoiceProfile } from "@/lib/types";

const FRAGMENT_CATEGORY_KEYS = ["example_post", "key_insight", "signature_phrase", "authority_content", "response_template"] as const;
type FragmentCategory = (typeof FRAGMENT_CATEGORY_KEYS)[number];

const HUE = TONE.urgency;

/**
 * Plantillas — every fragment as a white card with a preview (category
 * chip, tags, the text, how it has performed), and the add/edit form as
 * the first card in the same grid, in the language of every BEE form.
 * Renders a fragment of cards for the parent's .bee-overview.
 */
export function FragmentTemplateCards({ profile, fragments, onChanged }: { profile: VoiceProfile | null; fragments: BrandFragment[]; onChanged: (profileId: string) => Promise<void> }) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.library");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("key_insight");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoryLabel = (value: string) => ((FRAGMENT_CATEGORY_KEYS as readonly string[]).includes(value) ? t(`fragmentCategories.${value as FragmentCategory}`) : value);

  function startEdit(fragment: BrandFragment) {
    setEditingId(fragment.id);
    setCategory(fragment.category);
    setContent(fragment.content);
    setTags(fragment.tags.join(", "));
  }

  function cancel() {
    setEditingId(null);
    setCategory("key_insight");
    setContent("");
    setTags("");
  }

  async function save() {
    if (!profile || !content) return;
    setSaving(true);
    try {
      // No PATCH endpoint for fragments (same "replace, don't patch"
      // convention as the voice profile itself) — editing deletes the old
      // fragment and creates a fresh one, which resets its usage stats.
      if (editingId) await deleteBrandFragment(editingId);
      await addBrandFragment(profile.id, {
        content,
        category,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      });
      await onChanged(profile.id);
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function remove(fragmentId: string) {
    if (!profile || !window.confirm(t("library.confirmDelete"))) return;
    setDeletingId(fragmentId);
    try {
      await deleteBrandFragment(fragmentId);
      await onChanged(profile.id);
      if (editingId === fragmentId) cancel();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <OverviewCard span={4} title={editingId ? t("library.editFormTitle") : t("addFragmentForm.title")} caption={tp("formCaption")}>
        {!profile ? (
          <EmptyLine>{tp("needsProfile")}</EmptyLine>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="bee-fill flex flex-col gap-3"
          >
            <Field label={t("addFragmentForm.categoryLabel")}>
              <div className="flex flex-wrap gap-1.5">
                {FRAGMENT_CATEGORY_KEYS.map((key) => (
                  <Pill key={key} pressed={category === key} fill={tint(HUE, 45)} onClick={() => setCategory(key)}>
                    {t(`fragmentCategories.${key}`)}
                  </Pill>
                ))}
              </div>
            </Field>
            <Field label={t("addFragmentForm.contentLabel")} required>
              <textarea id="brand-fragment-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("addFragmentForm.contentPlaceholder")} rows={4} className="bee-input" required />
            </Field>
            <Field label={t("addFragmentForm.tagsLabel")} hint={tp("tagsHint")}>
              <input id="brand-fragment-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("addFragmentForm.tagsPlaceholder")} className="bee-input" />
            </Field>
            <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={cancel} className="bee-btn-ghost">
                {t("addFragmentForm.cancel")}
              </button>
              <button type="submit" disabled={saving || !content} className="bee-btn bee-btn--primary">
                {saving ? t("addFragmentForm.adding") : editingId ? t("library.saveEdit") : t("addFragmentForm.submit")}
              </button>
            </div>
          </form>
        )}
      </OverviewCard>

      {profile && fragments.length === 0 && (
        <OverviewCard span={8} title={tp("title")} caption={tp("caption")}>
          <EmptyLine>{t("library.empty")}</EmptyLine>
        </OverviewCard>
      )}

      {fragments.map((fragment) => (
        <OverviewCard
          key={fragment.id}
          span={4}
          title={categoryLabel(fragment.category)}
          caption={fragment.used_count > 0 ? t("library.usedCount", { count: fragment.used_count }) : t("library.neverUsed")}
          className={editingId === fragment.id ? "outline outline-2 outline-[var(--color-chart-5)]" : undefined}
        >
          <div className="bee-fill flex flex-col gap-3">
            {fragment.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {fragment.tags.map((tag) => (
                  <Chip key={tag} tone={HUE} strength={45} dot={false}>
                    #{tag}
                  </Chip>
                ))}
              </div>
            )}
            <p className="line-clamp-5 whitespace-pre-line rounded-[var(--radius-md)] px-3 py-2 text-sm leading-relaxed break-words" style={{ background: REST }} title={fragment.content}>
              {fragment.content}
            </p>
            <div className="flex items-center gap-2" title={fragment.performance_score != null ? t("library.scoreLabel", { score: Math.round(fragment.performance_score * 100) }) : t("library.noScore")}>
              <Meter value={fragment.performance_score ?? 0} tone={HUE} className="w-24 shrink-0" />
              <span className="bee-micro truncate">{fragment.performance_score != null ? t("library.scoreLabel", { score: Math.round(fragment.performance_score * 100) }) : t("library.noScore")}</span>
            </div>
            <div className="mt-auto flex justify-end gap-1 pt-1">
              <button type="button" onClick={() => startEdit(fragment)} className="bee-btn-text text-xs">
                {t("library.edit")}
              </button>
              <button type="button" onClick={() => void remove(fragment.id)} disabled={deletingId === fragment.id} className="bee-btn-text text-xs">
                {deletingId === fragment.id ? t("library.deleting") : t("library.delete")}
              </button>
            </div>
          </div>
        </OverviewCard>
      ))}
    </>
  );
}
