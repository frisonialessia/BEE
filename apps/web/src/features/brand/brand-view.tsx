"use client";

import { useTranslations } from "next-intl";

import { BrandVoicePanel } from "@/components/brand-voice";
import { DeepLearningPanel } from "@/components/deep-learning-panel";

/** Voz de marca — perfil de tono personal y adaptación psicográfica (DISC) del contenido. */
export function BrandView() {
  const tNav = useTranslations("nav.items");
  const t = useTranslations("probarNetworkBrandControl.brand");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{tNav("brand")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </div>
      </header>

      {/* Stacked, not side-by-side: BrandVoicePanel now carries a full
         fragment library plus the paste-and-extract flow (Phase 1 and 5 of
         this build-out) — a 50/50 grid squeezed its forms into half the
         viewport and read as cramped. Full width lets each section breathe
         and stays naturally responsive (no breakpoint math to keep in sync
         as either panel grows). */}
      <div className="space-y-6">
        <BrandVoicePanel />
        <DeepLearningPanel />
      </div>
    </div>
  );
}
