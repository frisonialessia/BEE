"use client";

import { BrandVoicePanel } from "@/components/brand-voice";
import { DeepLearningPanel } from "@/components/deep-learning-panel";

/** Voz de marca — perfil de tono personal y adaptación psicográfica (DISC) del contenido. */
export function BrandView() {
  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">Personal Brand · Psychographic</p>
        <div className="mt-1">
          <h1 className="bee-display">Voz de marca</h1>
          <p className="bee-caption mt-1">
            Perfil de voz y fragmentos de estilo, más el análisis DISC que adapta cada mensaje
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <BrandVoicePanel />
        <DeepLearningPanel />
      </div>
    </div>
  );
}
