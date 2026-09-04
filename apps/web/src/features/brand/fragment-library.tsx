"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { DATA, mix } from "@/components/charts/palette";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { Chip, FormLabel, Meter } from "@/features/brand/brand-primitives";
import { addBrandFragment, deleteBrandFragment } from "@/lib/api";
import type { BrandFragment, VoiceProfile } from "@/lib/types";

const FRAGMENT_CATEGORY_KEYS = ["example_post", "key_insight", "signature_phrase", "authority_content", "response_template"] as const;

/**
 * Row 3, left — the fragment library as a plain list: category chip, tags,
 * the text, a performance meter, edit/delete. The add/edit form opens
 * inline at the top of the same box. One hue: honey.
 */
export function FragmentLibraryBox({
  profile,
  fragments,
  onChanged,
}: {
  profile: VoiceProfile | null;
  fragments: BrandFragment[];
  onChanged: (profileId: string) => Promise<void>;
}) {
  const t = useTranslations("probarNetworkBrandControl.brand.panel");
  const tp = useTranslations("probarNetworkBrandControl.brand.page.library");
  const hue = DATA.honey;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("key_insight");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoryLabel = (value: string) =>
    (FRAGMENT_CATEGORY_KEYS as readonly string[]).includes(value) ? t(`fragmentCategories.${value as (typeof FRAGMENT_CATEGORY_KEYS)[number]}`) : value;

  function startAdd() {
    setEditingId(null);
    setCategory("key_insight");
    setContent("");
    setTags("");
    setOpen(true);
  }

  function startEdit(fragment: BrandFragment) {
    setEditingId(fragment.id);
    setCategory(fragment.category);
    setContent(fragment.content);
    setTags(fragment.tags.join(", "));
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setEditingId(null);
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
    <OverviewCard
      span={7}
      title={tp("title")}
      caption={tp("caption")}
      action={
        profile ? (
          <button type="button" onClick={startAdd} className="bee-btn-ghost text-xs">
            {t("addFragment")}
          </button>
        ) : undefined
      }
    >
      {!profile ? (
        <p className="bee-caption py-6 text-center">{tp("needsProfile")}</p>
      ) : (
        <div className="bee-fill flex flex-col gap-3">
          {open && (
            <div className="space-y-3 rounded-[var(--radius-md)] p-3" style={{ background: mix(hue, 8) }}>
              <p className="text-sm font-semibold">{editingId ? t("library.editFormTitle") : t("addFragmentForm.title")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FormLabel htmlFor="brand-fragment-category">{t("addFragmentForm.categoryLabel")}</FormLabel>
                  <select id="brand-fragment-category" value={category} onChange={(e) => setCategory(e.target.value)} className="bee-input">
                    {FRAGMENT_CATEGORY_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {t(`fragmentCategories.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FormLabel htmlFor="brand-fragment-tags">{t("addFragmentForm.tagsLabel")}</FormLabel>
                  <input id="brand-fragment-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("addFragmentForm.tagsPlaceholder")} className="bee-input" />
                </div>
                <div className="sm:col-span-2">
                  <FormLabel htmlFor="brand-fragment-content">{t("addFragmentForm.contentLabel")}</FormLabel>
                  <textarea
                    id="brand-fragment-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t("addFragmentForm.contentPlaceholder")}
                    rows={4}
                    className="bee-input"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void save()} disabled={saving || !content} className="bee-btn text-xs">
                  {saving ? t("addFragmentForm.adding") : editingId ? t("library.saveEdit") : t("addFragmentForm.submit")}
                </button>
                <button type="button" onClick={cancel} className="bee-btn text-xs">
                  {t("addFragmentForm.cancel")}
                </button>
              </div>
            </div>
          )}

          <p className="bee-micro">{tp("count", { count: fragments.length })}</p>

          {fragments.length === 0 ? (
            <p className="bee-caption">{t("library.empty")}</p>
          ) : (
            <ul className="divide-y divide-[var(--color-divider)]">
              {fragments.map((fragment) => (
                <li key={fragment.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={hue} strength={26}>
                        {categoryLabel(fragment.category)}
                      </Chip>
                      {fragment.tags.map((tag) => (
                        <Chip key={tag} tone={hue} strength={10} dot={false}>
                          #{tag}
                        </Chip>
                      ))}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-snug break-words" title={fragment.content}>{fragment.content}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Meter value={fragment.performance_score ?? 0} tone={hue} className="w-20 shrink-0" />
                      <span className="bee-micro truncate">
                        {fragment.performance_score != null
                          ? t("library.scoreLabel", { score: Math.round(fragment.performance_score * 100) })
                          : t("library.noScore")}
                        {" · "}
                        {fragment.used_count > 0 ? t("library.usedCount", { count: fragment.used_count }) : t("library.neverUsed")}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEdit(fragment)} className="bee-btn-text text-xs">
                      {t("library.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(fragment.id)}
                      disabled={deletingId === fragment.id}
                      className="bee-btn-text text-xs text-destructive"
                    >
                      {deletingId === fragment.id ? t("library.deleting") : t("library.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </OverviewCard>
  );
}
