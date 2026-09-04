"use client";

import { useCallback, useEffect, useState } from "react";

import { getBrandProfile, getChannelStatus, getStyleProfile, listBrandFragments } from "@/lib/api";
import type { BrandFragment, ChannelStatus, StyleProfileOut, VoiceProfile } from "@/lib/types";

/**
 * Everything the Voz de marca page reads, loaded once and shared by every
 * box: the active voice profile, its fragment library, channel status and
 * the learned style profile (which used to load only on demand inside the
 * learning panel — the page now shows its correction count in the stat
 * strip, so it loads with the rest). Boxes call the write endpoints
 * themselves and hand the result back through the setters here.
 */
export function useBrandVoice() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [fragments, setFragments] = useState<BrandFragment[]>([]);
  const [styleProfile, setStyleProfile] = useState<StyleProfileOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [p, ch, sp] = await Promise.all([getBrandProfile(), getChannelStatus(), getStyleProfile()]);
      if (cancelled) return;
      setProfile(p.data);
      setChannels(ch.data);
      setStyleProfile(sp.data);
      setLive(p.live || ch.live);
      if (p.data) {
        const fr = await listBrandFragments(p.data.id);
        if (cancelled) return;
        setFragments(fr.data);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFragments = useCallback(async (profileId: string) => {
    const fr = await listBrandFragments(profileId);
    setFragments(fr.data);
  }, []);

  return { profile, setProfile, channels, fragments, refreshFragments, styleProfile, setStyleProfile, loading, live };
}
