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

import { useEffect, useState } from "react";
import {
  addBrandFragment,
  createBrandProfile,
  getBrandProfile,
  getChannelStatus,
} from "@/lib/api";
import type { ChannelStatus, VoiceProfile } from "@/lib/types";

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉",
  linkedin: "in",
  twitter: "𝕏",
};

const FRAGMENT_CATEGORIES = [
  { value: "example_post", label: "Example Post" },
  { value: "key_insight", label: "Key Insight" },
  { value: "signature_phrase", label: "Signature Phrase" },
  { value: "authority_content", label: "Authority Content" },
  { value: "response_template", label: "Response Template" },
];

export function BrandVoicePanel() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddFragment, setShowAddFragment] = useState(false);
  const [fragmentContent, setFragmentContent] = useState("");
  const [fragmentCategory, setFragmentCategory] = useState("key_insight");
  const [fragmentTags, setFragmentTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTone, setCreateTone] = useState("analytical, direct");
  const [createTopics, setCreateTopics] = useState("B2B SaaS, AI in sales");
  const [createCTA, setCreateCTA] = useState("Let's talk.");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [p, ch] = await Promise.all([getBrandProfile(), getChannelStatus()]);
      setProfile(p.data);
      setChannels(ch.data);
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
      <div className="rounded-none border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-800 mb-3" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="rounded-none border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-background)]">Voice Brain</h3>
          <p className="text-xs text-zinc-500 mt-0.5">CEO personal brand profile — grounds all AI-generated content</p>
        </div>
        {!profile && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded-sm bg-amber-500 text-black font-medium hover:bg-amber-400"
          >
            Setup Voice
          </button>
        )}
        {profile && (
          <button
            onClick={() => setShowAddFragment(true)}
            className="text-xs px-3 py-1.5 rounded-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
          >
            + Add Fragment
          </button>
        )}
      </div>

      {/* Create profile form */}
      {showCreate && (
        <div className="rounded-sm border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-amber-400">Configure Voice Profile</p>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Your full name"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <input
            value={createTone}
            onChange={(e) => setCreateTone(e.target.value)}
            placeholder="Tone descriptors (comma-separated)"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <input
            value={createTopics}
            onChange={(e) => setCreateTopics(e.target.value)}
            placeholder="Authority topics (comma-separated)"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <input
            value={createCTA}
            onChange={(e) => setCreateCTA(e.target.value)}
            placeholder="Preferred CTA (e.g. Let's talk.)"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleCreateProfile()}
              disabled={saving || !createName}
              className="text-xs px-3 py-1.5 bg-amber-500 text-black rounded font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Profile"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-xs px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active profile */}
      {profile && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-amber-500/20 flex items-center justify-center">
              <span className="text-lg">{profile.display_name[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-background)]">{profile.display_name}</p>
              <p className="text-xs text-zinc-500">{profile.title ?? "CEO"}</p>
            </div>
          </div>

          {/* Tone pills */}
          {profile.tone_descriptors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.tone_descriptors.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 bg-zinc-800 rounded-sm text-zinc-300 border border-zinc-700">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Authority topics */}
          {profile.authority_topics.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">Authority topics</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.authority_topics.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 bg-amber-500/10 rounded-sm text-amber-400 border border-amber-500/20">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          {profile.preferred_cta && (
            <p className="text-xs text-zinc-400 italic">&quot;{profile.preferred_cta}&quot;</p>
          )}
        </div>
      )}

      {/* Add fragment form */}
      {showAddFragment && profile && (
        <div className="rounded-sm border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--color-background)]">Add Brand Fragment</p>
          <select
            value={fragmentCategory}
            onChange={(e) => setFragmentCategory(e.target.value)}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] focus:outline-none focus:border-amber-500"
          >
            {FRAGMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={fragmentContent}
            onChange={(e) => setFragmentContent(e.target.value)}
            placeholder="Paste an example post, key insight, or signature phrase..."
            rows={4}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <input
            value={fragmentTags}
            onChange={(e) => setFragmentTags(e.target.value)}
            placeholder="Tags (comma-separated): funding, SaaS, leadership"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-[var(--color-background)] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleAddFragment()}
              disabled={saving || !fragmentContent}
              className="text-xs px-3 py-1.5 bg-amber-500 text-black rounded font-medium disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Fragment"}
            </button>
            <button
              onClick={() => setShowAddFragment(false)}
              className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-400 rounded hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Channel status */}
      {channels.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Channel connections</p>
          <div className="grid grid-cols-3 gap-2">
            {channels.map((ch) => (
              <div
                key={ch.channel}
                className={`rounded-sm p-3 border text-center ${
                  ch.mock
                    ? "border-zinc-700 bg-zinc-800/50"
                    : "border-green-500/30 bg-green-950/20"
                }`}
              >
                <p className="text-sm font-bold text-[var(--color-background)]">{CHANNEL_ICONS[ch.channel] ?? ch.channel}</p>
                <p className="text-xs text-zinc-400 capitalize mt-0.5">{ch.channel}</p>
                <p className={`text-xs mt-1 ${ch.mock ? "text-zinc-600" : "text-green-400"}`}>
                  {ch.mock ? "not connected" : "active"}
                </p>
                {ch.tokens_remaining != null && (
                  <p className="text-xs text-zinc-600 mt-0.5">{ch.tokens_remaining} tokens left</p>
                )}
              </div>
            ))}
          </div>
          {channels.every((c) => c.mock) && (
            <p className="text-xs text-zinc-600 mt-2">
              All channels in mock mode. Add credentials in .env to go live.
            </p>
          )}
        </div>
      )}

      {!profile && !showCreate && (
        <p className="text-xs text-zinc-600">
          No voice profile configured. Set one up to enable brand-grounded AI content generation.
        </p>
      )}
    </div>
  );
}
