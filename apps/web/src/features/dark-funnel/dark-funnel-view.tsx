"use client";

import { useTranslations } from "next-intl";

import { DarkFunnelDashboard } from "@/components/dark-funnel-dashboard";

/** Dark Funnel — señales de intención de compra invisibles al tracking estándar. */
export function DarkFunnelView() {
  const t = useTranslations("signalsStrategies.darkFunnel");

  return (
    <div>
      <header className="mb-6">
        <p className="bee-eyebrow">{t("eyebrow")}</p>
        <div className="mt-1">
          <h1 className="bee-display">{t("title")}</h1>
          <p className="bee-caption mt-1">
            {t("subtitle")}
          </p>
        </div>
      </header>

      <DarkFunnelDashboard />
    </div>
  );
}
