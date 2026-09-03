"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOnboarding } from "@/features/onboarding/onboarding-context";

/** Reopens the guided intro (`OnboardingIntro`) any time — it only opens
 * itself automatically once, so this is the way back to it afterward. */
export function OnboardingHeaderButton() {
  const { openIntro } = useOnboarding();
  const t = useTranslations("common.headerHelp");

  return (
    <button
      type="button"
      onClick={openIntro}
      aria-label={t("ariaLabel")}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--color-primary)] hover:text-foreground"
    >
      <HelpCircle className="size-3.5 shrink-0" />
      <span className="hidden whitespace-nowrap lg:inline">{t("label")}</span>
    </button>
  );
}
