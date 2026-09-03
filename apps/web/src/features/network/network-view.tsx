"use client";

import { useTranslations } from "next-intl";

import { NetworkNavigatorPanel } from "@/components/network-navigator";

/** Network Navigator — caminos de introducción cálida dentro de la red de contactos. */
export function NetworkView() {
  const tNav = useTranslations("nav.items");
  const t = useTranslations("probarNetworkBrandControl.network");

  return (
    <div>
      <header className="mb-4">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{tNav("network")}</h1>
          <p className="bee-caption mt-1">{t("caption")}</p>
        </div>
      </header>

      <NetworkNavigatorPanel />
    </div>
  );
}
