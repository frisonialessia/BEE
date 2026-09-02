"use client";

/**
 * BrandVoicePanel — CEO Voice Profile editor and brand knowledge manager.
 *
 * Shows the active VoiceProfile, channel connection status, and allows
 * adding brand fragments (example posts, key insights, signature phrases).
 *
 * All AI-generated content in BEE is grounded in this profile — the CEO
 * configures it once and the PersonalBrandService consults it automatically.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  addBrandFragment,
  createBrandProfile,
  deleteBrandFragment,
  extractVoiceProfile,
  getBrandProfile,
  getChannelStatus,
  listBrandFragments,
  previewBrandVoice,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrandFragment, BrandVoicePreviewResult, ChannelStatus, VoiceProfile } from "@/lib/types";

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉",
  linkedin: "in",
  twitter: "𝕏",
};

export function BrandVoicePanel() {
  const t = useTranslations("probarNetworkBrandControl.brand.panel");
  const tLive = useTranslations("crm.board");
  const CHANNEL_LABELS: Record<string, string> = {
    email: t("channelLabels.email"),
    linkedin: t("channelLabels.linkedin"),
    twitter: t("channelLabels.twitter"),
  };
  const FRAGMENT_CATEGORIES = [
    { value: "example_post", label: t("fragmentCategories.example_post") },
    { value: "key_insight", label: t("fragmentCategories.key_insight") },
    { value: "signature_phrase", label: t("fragmentCategories.signature_phrase") },
    { value: "authority_content", label: t("fragmentCategories.authority_content") },
    { value: "response_template", label: t("fragmentCategories.response_template") },
  ];

  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [fragments, setFragments] = useState<BrandFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddFragment, setShowAddFragment] = useState(false);
  const [fragmentContent, setFragmentContent] = useState("");
  const [fragmentCategory, setFragmentCategory] = useState("key_insight");
  const [fragmentTags, setFragmentTags] = useState("");
  const [editingFragmentId, setEditingFragmentId] = useState<string | null>(null);
  const [deletingFragmentId, setDeletingFragmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createName, setCreateName] = useState("");
  // Seeded example values, not just placeholders — a CEO starting from
  // scratch gets a plausible starting point to edit rather than a blank
  // field. Kept in the interface's own language, same as any other
  // editable default value in this form.
  const [createTone, setCreateTone] = useState(t("createForm.defaultTone"));
  const [createTopics, setCreateTopics] = useState(t("createForm.defaultTopics"));
  const [createCTA, setCreateCTA] = useState(t("createForm.defaultCTA"));
  const [createBio, setCreateBio] = useState("");
  const [createMode, setCreateMode] = useState<"manual" | "extract">("manual");
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedBy, setExtractedBy] = useState<"llm" | "heuristic" | "demo" | null>(null);
  const [previewTopic, setPreviewTopic] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<BrandVoicePreviewResult | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [p, ch] = await Promise.all([getBrandProfile(), getChannelStatus()]);
      setProfile(p.data);
      setChannels(ch.data);
      setLive(p.live || ch.live);
      if (p.data) {
        const fr = await listBrandFragments(p.data.id);
        setFragments(fr.data);
      }
      setLoading(false);
    }
    void load();
  }, []);

  async function refreshFragments(profileId: string) {
    const fr = await listBrandFragments(profileId);
    setFragments(fr.data);
  }

  function startEditFragment(fragment: BrandFragment) {
    setEditingFragmentId(fragment.id);
    setFragmentCategory(fragment.category);
    setFragmentContent(fragment.content);
    setFragmentTags(fragment.tags.join(", "));
    setShowAddFragment(true);
  }

  function cancelFragmentForm() {
    setShowAddFragment(false);
    setEditingFragmentId(null);
    setFragmentContent("");
    setFragmentTags("");
  }

  async function handleDeleteFragment(fragmentId: string) {
    if (!profile || !window.confirm(t("library.confirmDelete"))) return;
    setDeletingFragmentId(fragmentId);
    try {
      await deleteBrandFragment(fragmentId);
      await refreshFragments(profile.id);
      if (editingFragmentId === fragmentId) cancelFragmentForm();
    } finally {
      setDeletingFragmentId(null);
    }
  }

  async function handleCreateProfile() {
    if (!createName) return;
    setSaving(true);
    try {
      const result = await createBrandProfile({
        display_name: createName,
        tone_descriptors: createTone.split(",").map((t) => t.trim()).filter(Boolean),
        authority_topics: createTopics.split(",").map((t) => t.trim()).filter(Boolean),
        preferred_cta: createCTA || undefined,
        bio_summary: createBio || undefined,
      });
      setProfile(result.data);
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleExtract() {
    if (pasteText.trim().length < 40) return;
    setExtracting(true);
    try {
      const result = await extractVoiceProfile(pasteText);
      const draft = result.data;
      if (draft.tone_descriptors.length > 0) setCreateTone(draft.tone_descriptors.join(", "));
      if (draft.authority_topics.length > 0) setCreateTopics(draft.authority_topics.join(", "));
      if (draft.preferred_cta) setCreateCTA(draft.preferred_cta);
      if (draft.bio_summary) setCreateBio(draft.bio_summary);
      setExtractedBy(draft.generated_by);
    } finally {
      setExtracting(false);
    }
  }

  async function handlePreview() {
    if (previewTopic.trim().length < 3) return;
    setPreviewing(true);
    try {
      const result = await previewBrandVoice(previewTopic);
      setPreview(result.data);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleAddFragment() {
    if (!profile || !fragmentContent) return;
    setSaving(true);
    try {
      // No PATCH endpoint for fragments (same "replace, don't patch"
      // convention as the voice profile itself) — editing deletes the old
      // fragment and creates a fresh one with the edited content. This
      // does reset performance_score/used_count to zero, same tradeoff
      // re-creating the profile itself already has for its own fields.
      if (editingFragmentId) {
        await deleteBrandFragment(editingFragmentId);
      }
      await addBrandFragment(profile.id, {
        content: fragmentContent,
        category: fragmentCategory,
        tags: fragmentTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      await refreshFragments(profile.id);
      cancelFragmentForm();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bee-panel space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  return (
    <div className="bee-panel space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="bee-panel__title">{t("title")}</h3>
          <p className="bee-panel__subtitle">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={live ? "success" : "warning"}>{live ? tLive("live") : tLive("demo")}</Badge>
          {!profile && (
            <button onClick={() => setShowCreate(true)} className="bee-btn bee-btn--primary">
              {t("setUpVoice")}
            </button>
          )}
          {profile && (
            <button
              onClick={() => {
                setEditingFragmentId(null);
                setFragmentCategory("key_insight");
                setFragmentContent("");
                setFragmentTags("");
                setShowAddFragment(true);
              }}
              className="bee-btn-ghost"
            >
              {t("addFragment")}
            </button>
          )}
        </div>
      </div>

      {/* Create profile form */}
      {showCreate && (
        <div className="bee-inset space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="bee-eyebrow">{t("createForm.title")}</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCreateMode("manual")}
                className={createMode === "manual" ? "bee-btn-ghost bee-btn-ghost--active text-xs" : "bee-btn-ghost text-xs"}
              >
                {t("createForm.modeManual")}
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("extract")}
                className={createMode === "extract" ? "bee-btn-ghost bee-btn-ghost--active text-xs" : "bee-btn-ghost text-xs"}
              >
                {t("createForm.modeExtract")}
              </button>
            </div>
          </div>

          {createMode === "extract" && (
            <div className="space-y-2 border-b border-dashed border-border pb-3">
              <p className="bee-caption">{t("createForm.extractHint")}</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={t("createForm.pastePlaceholder")}
                rows={6}
                className="bee-input"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExtract()}
                  disabled={extracting || pasteText.trim().length < 40}
                  className="bee-btn bee-btn--primary text-xs"
                >
                  {extracting ? t("createForm.extracting") : t("createForm.extractButton")}
                </button>
                {extractedBy && (
                  <span className="bee-caption">
                    {extractedBy === "heuristic" || extractedBy === "demo"
                      ? t("createForm.extractedByHeuristic")
                      : t("createForm.extractedByLlm")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t("createForm.nameLabel")}
              </label>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t("createForm.namePlaceholder")}
                className="bee-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t("createForm.toneLabel")}
              </label>
              <input
                value={createTone}
                onChange={(e) => setCreateTone(e.target.value)}
                placeholder={t("createForm.tonePlaceholder")}
                className="bee-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t("createForm.topicsLabel")}
              </label>
              <input
                value={createTopics}
                onChange={(e) => setCreateTopics(e.target.value)}
                placeholder={t("createForm.topicsPlaceholder")}
                className="bee-input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t("createForm.bioLabel")}
              </label>
              <textarea
                value={createBio}
                onChange={(e) => setCreateBio(e.target.value)}
                placeholder={t("createForm.bioPlaceholder")}
                rows={4}
                className="bee-input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t("createForm.ctaLabel")}
              </label>
              <input
                value={createCTA}
                onChange={(e) => setCreateCTA(e.target.value)}
                placeholder={t("createForm.ctaPlaceholder")}
                className="bee-input"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCreateProfile()}
              disabled={saving || !createName}
              className="bee-btn bee-btn--primary"
            >
              {saving ? t("createForm.saving") : t("createForm.submit")}
            </button>
            <button onClick={() => setShowCreate(false)} className="bee-btn">
              {t("createForm.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Active profile */}
      {profile && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="bee-bento--primary flex h-9 w-9 items-center justify-center border border-[var(--color-divider)]">
              <span className="text-lg">{profile.display_name[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{profile.display_name}</p>
              <p className="bee-caption">{profile.title ?? "CEO"}</p>
            </div>
          </div>

          {/* Tone pills */}
          {profile.tone_descriptors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.tone_descriptors.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          {/* Authority topics */}
          {profile.authority_topics.length > 0 && (
            <div>
              <p className="bee-caption mb-1.5">{t("authorityTopics")}</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.authority_topics.map((topic) => (
                  <Badge key={topic} variant="warning">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          {profile.preferred_cta && (
            <p className="bee-caption italic">&quot;{profile.preferred_cta}&quot;</p>
          )}
        </div>
      )}

      {/* Live voice preview */}
      {profile && (
        <div className="bee-inset space-y-3 p-5">
          <p className="bee-eyebrow">{t("preview.title")}</p>
          <p className="bee-caption">{t("preview.hint")}</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={previewTopic}
              onChange={(e) => setPreviewTopic(e.target.value)}
              placeholder={t("preview.topicPlaceholder")}
              className="bee-input min-w-[200px] flex-1"
            />
            <button
              onClick={() => void handlePreview()}
              disabled={previewing || previewTopic.trim().length < 3}
              className="bee-btn bee-btn--primary"
            >
              {previewing ? t("preview.previewing") : t("preview.button")}
            </button>
          </div>
          {preview && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bee-panel space-y-1.5 p-3">
                <p className="bee-caption font-medium">{t("preview.genericLabel")}</p>
                <p className="text-sm text-muted-foreground">{preview.generic_version}</p>
              </div>
              <div className="bee-panel space-y-1.5 border-l-2 border-[var(--color-chart-4)] p-3">
                <p className="bee-caption font-medium" style={{ color: "var(--color-chart-4)" }}>
                  {t("preview.brandedLabel")}
                </p>
                <p className="text-sm">{preview.branded_version}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/edit fragment form */}
      {showAddFragment && profile && (
        <div className="bee-inset space-y-4 p-5">
          <p className="bee-eyebrow">
            {editingFragmentId ? t("library.editFormTitle") : t("addFragmentForm.title")}
          </p>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("addFragmentForm.categoryLabel")}
            </label>
            <select
              value={fragmentCategory}
              onChange={(e) => setFragmentCategory(e.target.value)}
              className="bee-input"
            >
              {FRAGMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("addFragmentForm.contentLabel")}
            </label>
            <textarea
              value={fragmentContent}
              onChange={(e) => setFragmentContent(e.target.value)}
              placeholder={t("addFragmentForm.contentPlaceholder")}
              rows={6}
              className="bee-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("addFragmentForm.tagsLabel")}
            </label>
            <input
              value={fragmentTags}
              onChange={(e) => setFragmentTags(e.target.value)}
              placeholder={t("addFragmentForm.tagsPlaceholder")}
              className="bee-input"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => void handleAddFragment()}
              disabled={saving || !fragmentContent}
              className="bee-btn bee-btn--primary"
            >
              {saving
                ? t("addFragmentForm.adding")
                : editingFragmentId
                  ? t("library.saveEdit")
                  : t("addFragmentForm.submit")}
            </button>
            <button onClick={cancelFragmentForm} className="bee-btn">
              {t("addFragmentForm.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Fragment library */}
      {profile && (
        <div>
          <p className="bee-caption mb-2">{t("library.title", { count: fragments.length })}</p>
          {fragments.length === 0 ? (
            <p className="bee-caption">{t("library.empty")}</p>
          ) : (
            <div className="space-y-2">
              {fragments.map((fragment) => (
                <div key={fragment.id} className="bee-inset flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {FRAGMENT_CATEGORIES.find((c) => c.value === fragment.category)?.label ?? fragment.category}
                      </Badge>
                      {fragment.tags.map((tag) => (
                        <Badge key={tag} variant="warning">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed break-words">{fragment.content}</p>
                    <p className="bee-caption mt-1">
                      {fragment.performance_score != null
                        ? t("library.scoreLabel", { score: Math.round(fragment.performance_score * 100) })
                        : t("library.noScore")}
                      {" · "}
                      {fragment.used_count > 0
                        ? t("library.usedCount", { count: fragment.used_count })
                        : t("library.neverUsed")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <button onClick={() => startEditFragment(fragment)} className="bee-btn-ghost text-xs">
                      {t("library.edit")}
                    </button>
                    <button
                      onClick={() => void handleDeleteFragment(fragment.id)}
                      disabled={deletingFragmentId === fragment.id}
                      className="bee-btn-ghost text-xs text-destructive"
                    >
                      {deletingFragmentId === fragment.id ? t("library.deleting") : t("library.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Channel status */}
      {channels.length > 0 && (
        <div>
          <p className="bee-caption mb-2">{t("channelConnections")}</p>
          <div className="grid grid-cols-3 gap-2">
            {channels.map((ch) => (
              <div
                key={ch.channel}
                className={`p-3 text-center ${ch.mock ? "bee-inset" : "bee-bento--warm bee-bento"}`}
              >
                <p className="text-sm font-bold">{CHANNEL_ICONS[ch.channel] ?? ch.channel}</p>
                <p className="bee-caption mt-0.5">{CHANNEL_LABELS[ch.channel] ?? ch.channel}</p>
                <p className="bee-caption mt-1">
                  {ch.mock ? t("notConnected") : t("active")}
                </p>
                {ch.tokens_remaining != null && (
                  <p className="bee-caption mt-0.5">{t("tokensRemaining", { count: ch.tokens_remaining })}</p>
                )}
              </div>
            ))}
          </div>
          {channels.every((c) => c.mock) && (
            <p className="bee-caption mt-2">
              {t.rich("allChannelsSimulated", {
                integrations: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </p>
          )}
        </div>
      )}

      {!profile && !showCreate && <p className="bee-caption">{t("noProfile")}</p>}
    </div>
  );
}
