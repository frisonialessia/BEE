"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OverviewCard } from "@/components/dashboard/overview-card";

const STORAGE_KEY = "bee_weekly_recap_dismissed_v1";

/** The Monday of `date`'s week, as a stable string key. */
function weekKeyFor(date: Date): string {
  const d = new Date(date);
  const isoDay = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - isoDay);
  return d.toDateString();
}

/**
 * A small recap, dismissible once per calendar week (localStorage, same
 * pattern as the onboarding intro) — three real facts from the last 7
 * days, the same numbers already on the page elsewhere, read together
 * instead of scattered across tiles. Never shown with nothing to say.
 */
export function WeeklyRecapCard({
  now,
  signals,
  won,
  streakDays,
}: {
  now: number;
  signals: number;
  won: number;
  streakDays: number;
}) {
  const t = useTranslations("celebration.recap");
  const weekKey = weekKeyFor(new Date(now));
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === weekKey;
    } catch {
      return false;
    }
  });

  if (dismissed || (signals === 0 && won === 0)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, weekKey);
    } catch {
      // Not persisting across reloads isn't worth an error over.
    }
  }

  return (
    <OverviewCard
      span={12}
      title={t("title")}
      caption={t("caption")}
      className="lg:min-h-0!"
      action={
        <button type="button" onClick={dismiss} aria-label={t("dismiss")} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-[var(--color-background)]">
          <X className="size-4" />
        </button>
      }
    >
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="bee-micro">{t("signals")}</p>
          <p className="text-xl font-bold tabular-nums">{signals}</p>
        </div>
        <div>
          <p className="bee-micro">{t("won")}</p>
          <p className="text-xl font-bold tabular-nums">{won}</p>
        </div>
        <div>
          <p className="bee-micro">{t("streak")}</p>
          <p className="text-xl font-bold tabular-nums">{streakDays}</p>
        </div>
      </div>
    </OverviewCard>
  );
}
