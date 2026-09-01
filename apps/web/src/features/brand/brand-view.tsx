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

      <div className="grid gap-4 lg:grid-cols-2">
        <BrandVoicePanel />
        <DeepLearningPanel />
      </div>
    </div>
  );
}
