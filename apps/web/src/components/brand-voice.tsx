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
  getBrandProfile,
  getChannelStatus,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChannelStatus, VoiceProfile } from "@/lib/types";

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
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddFragment, setShowAddFragment] = useState(false);
  const [fragmentContent, setFragmentContent] = useState("");
  const [fragmentCategory, setFragmentCategory] = useState("key_insight");
  const [fragmentTags, setFragmentTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [createName, setCreateName] = useState("");
  // Seeded example values, not just placeholders — a CEO starting from
  // scratch gets a plausible starting point to edit rather than a blank
  // field. Kept in the interface's own language, same as any other
  // editable default value in this form.
  const [createTone, setCreateTone] = useState(t("createForm.defaultTone"));
  const [createTopics, setCreateTopics] = useState(t("createForm.defaultTopics"));
  const [createCTA, setCreateCTA] = useState(t("createForm.defaultCTA"));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [p, ch] = await Promise.all([getBrandProfile(), getChannelStatus()]);
      setProfile(p.data);
      setChannels(ch.data);
      setLive(p.live || ch.live);
      setLoading(false);
    }
    void load();
  }, []);

  async function handleCreateProfile() {
    if (!createName) return;
    setSaving(true);
    try {
      const result = await createBrandProfile({
        display_name: createName,
        tone_descriptors: createTone.split(",").map((t) => t.trim()),
        authority_topics: createTopics.split(",").map((t) => t.trim()),
        preferred_cta: createCTA,
      });
      setProfile(result.data);
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFragment() {
    if (!profile || !fragmentContent) return;
    setSaving(true);
    try {
      await addBrandFragment(profile.id, {
        content: fragmentContent,
        category: fragmentCategory,
        tags: fragmentTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setFragmentContent("");
      setFragmentTags("");
      setShowAddFragment(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="bee-panel__title">{t("title")}</h3>
          <p className="bee-panel__subtitle">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={live ? "success" : "warning"}>{live ? tLive("live") : tLive("demo")}</Badge>
          {!profile && (
            <button onClick={() => setShowCreate(true)} className="bee-btn bee-btn--primary">
              {t("setUpVoice")}
            </button>
          )}
          {profile && (
            <button onClick={() => setShowAddFragment(true)} className="bee-btn-ghost">
              {t("addFragment")}
            </button>
          )}
        </div>
      </div>

      {/* Create profile form */}
      {showCreate && (
        <div className="bee-inset space-y-3 p-4">
          <p className="bee-eyebrow">{t("createForm.title")}</p>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={t("createForm.namePlaceholder")}
            className="bee-input"
          />
          <input
            value={createTone}
            onChange={(e) => setCreateTone(e.target.value)}
            placeholder={t("createForm.tonePlaceholder")}
            className="bee-input"
          />
          <input
            value={createTopics}
            onChange={(e) => setCreateTopics(e.target.value)}
            placeholder={t("createForm.topicsPlaceholder")}
            className="bee-input"
          />
          <input
            value={createCTA}
            onChange={(e) => setCreateCTA(e.target.value)}
            placeholder={t("createForm.ctaPlaceholder")}
            className="bee-input"
          />
          <div className="flex gap-2">
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

      {/* Add fragment form */}
      {showAddFragment && profile && (
        <div className="bee-inset space-y-3 p-4">
          <p className="bee-eyebrow">{t("addFragmentForm.title")}</p>
          <select
            value={fragmentCategory}
            onChange={(e) => setFragmentCategory(e.target.value)}
            className="bee-input"
          >
            {FRAGMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={fragmentContent}
            onChange={(e) => setFragmentContent(e.target.value)}
            placeholder={t("addFragmentForm.contentPlaceholder")}
            rows={4}
            className="bee-input resize-none"
          />
          <input
            value={fragmentTags}
            onChange={(e) => setFragmentTags(e.target.value)}
            placeholder={t("addFragmentForm.tagsPlaceholder")}
            className="bee-input"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleAddFragment()}
              disabled={saving || !fragmentContent}
              className="bee-btn bee-btn--primary"
            >
              {saving ? t("addFragmentForm.adding") : t("addFragmentForm.submit")}
            </button>
            <button onClick={() => setShowAddFragment(false)} className="bee-btn">
              {t("addFragmentForm.cancel")}
            </button>
          </div>
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
